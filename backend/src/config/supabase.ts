import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Public client — uses anon key, respects Row Level Security
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Admin client — uses service role key, bypasses RLS (server-side only)
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
