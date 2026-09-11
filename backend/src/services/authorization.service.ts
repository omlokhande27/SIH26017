import { supabaseAdmin } from '../config/supabase';
import { translateDbError } from '../utils/db-error';
import {
  ROLES_WITH_GLOBAL_READ,
  ROLES_WITH_GLOBAL_WRITE,
  ROLES_WITH_ASSIGNED_WRITE,
  type AppRole,
} from '../config/roles';

/**
 * Project-level authorization decisions.
 *
 * This module answers one question — "may this user do this to this project?"
 * — and every controller asks it here rather than re-deriving the rule. The
 * rules mirror the RLS policies in database/schema.sql §19 so the two layers
 * agree; where they ever disagree, RLS is the backstop and this is the layer
 * that actually runs for API traffic, because the backend connects with the
 * service-role key and bypasses RLS entirely.
 */

export type AccessMode = 'read' | 'write';

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'role_forbidden' | 'not_assigned' | 'project_not_found' }
  | { allowed: false; reason: 'lookup_failed'; detail: string };

/**
 * Is this user assigned to this project?
 *
 * Mirrors `public.is_assigned_to_project(uuid)` in the schema exactly,
 * including the second limb: an explicit row in `project_assignments`, OR
 * having created the project. Dropping the `created_by` limb here would make
 * the API stricter than RLS and lock officers out of projects they created.
 */
export async function isAssignedToProject(
  userId: string,
  projectId: string,
): Promise<{ ok: true; assigned: boolean } | { ok: false; detail: string }> {
  const assignment = await supabaseAdmin
    .from('project_assignments')
    .select('id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (assignment.error) return { ok: false, detail: assignment.error.message };
  if (assignment.data) return { ok: true, assigned: true };

  const created = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('created_by', userId)
    .maybeSingle();

  if (created.error) return { ok: false, detail: created.error.message };
  return { ok: true, assigned: Boolean(created.data) };
}

/**
 * The set of projects a caller may READ.
 *
 * Returns `null` for a caller with global read (ADMIN / ANALYST / VIEWER),
 * meaning "no restriction" — which is what the SQL aggregation functions in
 * migration 0005 expect for an unscoped query. An OFFICER gets an explicit
 * list; an OFFICER with no assignments gets `[]`, which the SQL reads as an
 * empty set rather than as "everything".
 *
 * ######################################################################
 * # THIS IS THE AUTHORIZATION BOUNDARY FOR EVERY AGGREGATE ENDPOINT.   #
 * #                                                                    #
 * # Dashboard and analytics queries span the whole table, so there is  #
 * # no project id for `requireProjectAccess` to guard. The backend     #
 * # queries with the service-role key, which bypasses RLS, so nothing  #
 * # else would stop an OFFICER seeing national totals. Every aggregate #
 * # call MUST pass the result of this function.                        #
 * ######################################################################
 */
export async function visibleProjectIds(user: {
  id: string;
  role: AppRole;
}): Promise<string[] | null> {
  if (ROLES_WITH_GLOBAL_READ.includes(user.role)) return null;

  const assignments = await supabaseAdmin
    .from('project_assignments')
    .select('project_id')
    .eq('user_id', user.id);

  if (assignments.error) {
    throw translateDbError(assignments.error, { context: { op: 'visibleProjectIds' } });
  }

  const authored = await supabaseAdmin.from('projects').select('id').eq('created_by', user.id);
  if (authored.error) {
    throw translateDbError(authored.error, { context: { op: 'visibleProjectIds' } });
  }

  const ids = new Set<string>();
  for (const row of assignments.data ?? []) ids.add((row as { project_id: string }).project_id);
  for (const row of authored.data ?? []) ids.add((row as { id: string }).id);
  return [...ids];
}

/** Does the project exist at all? Distinguishes 404 from 403. */
export async function projectExists(
  projectId: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; detail: string }> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();

  if (error) return { ok: false, detail: error.message };
  return { ok: true, exists: Boolean(data) };
}

/**
 * The central project-access decision.
 *
 * READ
 *   ADMIN / ANALYST / VIEWER  every project (prototype national visibility)
 *   OFFICER                   assigned projects only
 *
 * WRITE
 *   ADMIN                     every project
 *   OFFICER                   assigned projects only
 *   ANALYST / VIEWER          never — both are read-only oversight roles
 *
 * Note what this does NOT cover: creating and deleting projects are ADMIN-only
 * and are not project-scoped (there is no project to be assigned to yet), so
 * they use `requireRole('ADMIN')` instead.
 */
export async function canAccessProject(
  user: { id: string; role: AppRole },
  projectId: string,
  mode: AccessMode,
): Promise<AccessDecision> {
  const globallyPermitted =
    mode === 'read'
      ? ROLES_WITH_GLOBAL_READ.includes(user.role)
      : ROLES_WITH_GLOBAL_WRITE.includes(user.role);

  if (globallyPermitted) {
    // Still confirm the project exists, so a caller with global access gets a
    // 404 for a missing project rather than a confusing success on nothing.
    const exists = await projectExists(projectId);
    if (!exists.ok) return { allowed: false, reason: 'lookup_failed', detail: exists.detail };
    return exists.exists ? { allowed: true } : { allowed: false, reason: 'project_not_found' };
  }

  // Not globally permitted. For writes, only assignment-capable roles may
  // proceed to the assignment check — this is what stops ANALYST and VIEWER
  // writing to a project even if someone assigns them to one.
  if (mode === 'write' && !ROLES_WITH_ASSIGNED_WRITE.includes(user.role)) {
    return { allowed: false, reason: 'role_forbidden' };
  }

  const exists = await projectExists(projectId);
  if (!exists.ok) return { allowed: false, reason: 'lookup_failed', detail: exists.detail };
  if (!exists.exists) return { allowed: false, reason: 'project_not_found' };

  const assignment = await isAssignedToProject(user.id, projectId);
  if (!assignment.ok) {
    return { allowed: false, reason: 'lookup_failed', detail: assignment.detail };
  }

  return assignment.assigned ? { allowed: true } : { allowed: false, reason: 'not_assigned' };
}
