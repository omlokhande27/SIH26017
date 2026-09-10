import { supabaseAdmin } from '../config/supabase';
import { normalizeRole, type AppRole } from '../config/roles';

/**
 * Trusted, server-side resolution of a user's application role.
 *
 * WHY THIS EXISTS
 * ---------------
 * The role must come from `public.profiles`, never from the JWT. A Supabase
 * JWT carries `user_metadata`, and `user_metadata` is writable by the user
 * themselves through `supabase.auth.updateUser({ data: { role: 'ADMIN' } })`.
 * Reading the role from there — as this backend previously did — let any
 * authenticated user mint their own privileges.
 *
 * `profiles.role` is protected in the other direction: the RLS policy
 * `profiles_update_own_no_role_change` rejects a self-service role change, so
 * the value stored there can only have been set by an ADMIN.
 *
 * This is the rule docs/DATABASE.md §9 states for the backend layer:
 * "Resolve the caller's role from `profiles` server-side — never from the
 * request body or a client-supplied claim."
 *
 * WHY THE ADMIN CLIENT
 * --------------------
 * `supabaseAdmin` bypasses RLS. That is appropriate for exactly this lookup:
 * a single row fetched by primary key, to establish who the caller is before
 * any authorization decision can be made. Using the anon client would require
 * the caller's own token, which creates a chicken-and-egg with the policy that
 * decides whether they may read their profile at all.
 *
 * It is a narrow, deliberate use of the service role — not a licence to use it
 * for business queries, which must go through the authorization layer.
 */

export interface ResolvedProfile {
  id: string;
  role: AppRole;
  full_name: string | null;
}

export type ProfileLookupResult =
  | { ok: true; profile: ResolvedProfile }
  | { ok: false; reason: 'not_found' | 'invalid_role' | 'lookup_failed'; detail?: string };

export async function getProfileForUser(userId: string): Promise<ProfileLookupResult> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'lookup_failed', detail: error.message };
  }

  // No profile row. The user authenticated with Supabase Auth but was never
  // provisioned in the application.
  //
  // This FAILS CLOSED rather than defaulting to VIEWER. Under the prototype
  // visibility policy VIEWER can read every project nationally, so treating an
  // unprovisioned account as a VIEWER would hand full national read access to
  // anyone holding a valid JWT. "Default to the least role" is only safe when
  // the least role can see nothing, and here it cannot.
  //
  // docs/DATABASE.md §9 notes the intended fix: an auth.users -> profiles
  // trigger that provisions a VIEWER row on signup. Until that exists, an
  // account without a profile is rejected.
  if (!data) {
    return { ok: false, reason: 'not_found' };
  }

  const role = normalizeRole(data.role);
  if (!role) {
    // The database CHECK constraint should make this unreachable. If it is
    // ever reached, the stored value is not one the backend understands, and
    // guessing which privileges were intended would be the wrong move.
    return { ok: false, reason: 'invalid_role', detail: String(data.role) };
  }

  return {
    ok: true,
    profile: { id: data.id, role, full_name: data.full_name ?? null },
  };
}
