-- LandGuard AI: allow users to maintain their own display details.
-- Roles, government IDs, and officer approval remain administrator-controlled.
-- Run after 20260925000100_fix_auth_profiles.sql in Supabase SQL Editor.

begin;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon')
    and (
      new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.government_id is distinct from old.government_id
      or new.is_government_officer is distinct from old.is_government_officer
    ) then
    raise exception 'Profile privileges are managed by an administrator.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileges();

drop policy if exists "Users can update own display profile" on public.profiles;
create policy "Users can update own display profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

commit;
