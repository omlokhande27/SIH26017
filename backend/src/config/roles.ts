/**
 * Application roles — the single source of truth for the backend.
 *
 * These four values mirror the CHECK constraint on `public.profiles.role`
 * exactly, including their case. The database stores them uppercase, so the
 * backend uses uppercase everywhere and normalises at the boundary. An earlier
 * version defaulted to the lowercase string 'viewer', which silently failed
 * every comparison against a database value — a mismatch that reads as a typo
 * but behaves as an authorization bug.
 *
 * The policy encoded here is the documented SIH prototype policy. See
 * docs/DATABASE.md §9 for the full rationale, including why VIEWER and ANALYST
 * currently read nationally.
 */

export const APP_ROLES = ['ADMIN', 'ANALYST', 'OFFICER', 'VIEWER'] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Type guard: is this string one of the four known roles, exactly? */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Normalise a role string coming from the database.
 *
 * Trims and uppercases, then validates against the known set. Returns null for
 * anything unrecognised rather than guessing — an unknown role must fail the
 * request, never silently degrade to a working one. Degrading to VIEWER would
 * still grant national read access under the prototype policy, so a "safe
 * fallback" is not actually safe here.
 */
export function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  return isAppRole(candidate) ? candidate : null;
}

/**
 * Roles that may READ any project, regardless of assignment.
 *
 * VIEWER and ANALYST are included because of the documented prototype
 * visibility decision: "allowed project visibility" is not yet defined, so
 * read access is national for now. Narrowing it later means changing this set
 * and the matching RLS SELECT policies — nothing else.
 */
export const ROLES_WITH_GLOBAL_READ: readonly AppRole[] = ['ADMIN', 'ANALYST', 'VIEWER'];

/**
 * Roles that may WRITE to any project without an assignment.
 *
 * ADMIN only. OFFICER writes are permitted but scoped to assigned projects,
 * which is an assignment check rather than a role check — see
 * `requireProjectAccess` in the authorization middleware.
 */
export const ROLES_WITH_GLOBAL_WRITE: readonly AppRole[] = ['ADMIN'];

/**
 * Roles that may write to a project they are assigned to.
 *
 * ADMIN is included so an admin acting on one specific project passes the same
 * guard without a special case at every call site.
 */
export const ROLES_WITH_ASSIGNED_WRITE: readonly AppRole[] = ['ADMIN', 'OFFICER'];

/** Roles permitted to manage the system: profiles, roles, model registry, reference data. */
export const ROLES_WITH_SYSTEM_ADMIN: readonly AppRole[] = ['ADMIN'];
