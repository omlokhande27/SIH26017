import { createClient } from '@supabase/supabase-js';
import { env, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } from './env';

/**
 * The two Supabase clients, and the privilege boundary between them.
 *
 * The exported NAMES are unchanged (`supabase`, `supabaseAdmin`) so nothing
 * downstream — services, tests, mocks — has to change. What changed is where
 * the keys come from: `./env` now resolves either generation of Supabase API
 * key, preferring the new format when both are configured.
 *
 * ###########################################################################
 * # THE KEY FORMAT CHANGED. THE TRUST MODEL DID NOT.                        #
 * #                                                                        #
 * #   supabase       publishable / anon key   -> RLS APPLIES               #
 * #   supabaseAdmin  secret / service_role    -> RLS IS BYPASSED           #
 * #                                                                        #
 * # `sb_publishable_…` is exactly as privileged as the legacy anon key, and #
 * # `sb_secret_…` exactly as privileged as service_role. Migrating key      #
 * # formats must never be read as a change in what a key may do.           #
 * ###########################################################################
 */

/**
 * RLS-respecting client.
 *
 * Safe to use for anything that should be subject to the database's own
 * policies. This is the client the health probe uses, and the one to prefer
 * for user-scoped reads where practical, so RLS applies as defence in depth.
 */
export const supabase = createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * Privileged client — BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Every policy in database/schema.sql is invisible to queries made through
 * this client, which is why the backend carries its own authorization layer
 * (middleware/authorize.middleware.ts). Reaching for this client is a decision
 * to take responsibility for access control in application code.
 *
 * Never expose this client, or the key behind it, to a browser.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
