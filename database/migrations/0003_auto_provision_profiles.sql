-- ============================================================================
-- 0003 — provision a profiles row for every new auth user
-- ============================================================================
--
-- The backend resolves authorization from public.profiles and fails closed
-- when the row is missing (see backend/src/services/profile.service.ts). Until
-- now nothing created that row, so a user who signed up successfully was
-- refused by every endpoint with 403.
--
-- THE ROLE IS A HARD-CODED LITERAL 'VIEWER'. It is deliberately NOT read from
-- raw_user_meta_data: that field is client-supplied at signup and rewritable
-- afterwards through auth.updateUser(), so sourcing the role from it would let
-- any user self-provision as ADMIN. Promotion is an ADMIN action against
-- profiles, guarded by RLS.
--
-- Safe to re-run. Backfills existing users at the end.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NULLIF(LEFT(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), 200), ''),
    'VIEWER'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill: existing users predate the trigger. ON CONFLICT DO NOTHING means
-- anyone who already has a profile keeps their current role untouched.
INSERT INTO public.profiles (id, full_name, role)
SELECT
  u.id,
  NULLIF(LEFT(TRIM(COALESCE(u.raw_user_meta_data ->> 'full_name', '')), 200), ''),
  'VIEWER'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

COMMIT;
