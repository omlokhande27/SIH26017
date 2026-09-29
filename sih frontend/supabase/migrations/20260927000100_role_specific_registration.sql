-- LandGuard AI: role-specific account registration.
-- Each account type carries its own identifier, so the signup request is stored
-- separately from the granted role and verified by an administrator.
-- Run after 20260925000100_fix_auth_profiles.sql in Supabase SQL Editor.
--
-- Security model is unchanged:
--   profiles.role still defaults to VIEWER and is only promoted by an admin.
--   requested_role / requested_role_id record what the applicant asked for.
--   They never grant access on their own.

begin;

alter table public.profiles
  add column if not exists requested_role text,
  add column if not exists requested_role_id text,
  add column if not exists role_verified_at timestamptz,
  add column if not exists role_verified_by uuid;

-- Only the three account types offered on the registration screen.
alter table public.profiles
  drop constraint if exists profiles_requested_role_valid;

alter table public.profiles
  add constraint profiles_requested_role_valid
  check (requested_role is null or requested_role in ('GOVERNMENT_OFFICER', 'PROJECT_MANAGER', 'VIEWER'));

-- Administrator lookup index for pending verification requests.
create index if not exists profiles_requested_role_idx
  on public.profiles (requested_role)
  where requested_role is not null and role_verified_at is null;

-- Backfill request columns for accounts created before this migration.
update public.profiles
set
  requested_role = coalesce(requested_role, role),
  requested_role_id = coalesce(requested_role_id, government_id)
where requested_role is null;

-- Provision signup requests onto the profile row. The role stays VIEWER here;
-- raw_user_meta_data is intentionally ignored for role assignment.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    role,
    department,
    designation,
    government_id,
    is_government_officer,
    requested_role,
    requested_role_id,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, new.phone, 'User'), '@', 1)
    ),
    'VIEWER',
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'department'), ''), 'Land Acquisition Department'),
    nullif(trim(new.raw_user_meta_data ->> 'designation'), ''),
    null,
    false,
    case
      when upper(replace(coalesce(new.raw_user_meta_data ->> 'requested_role', ''), '-', '_'))
        in ('GOVERNMENT_OFFICER', 'PROJECT_MANAGER', 'VIEWER')
      then upper(replace(new.raw_user_meta_data ->> 'requested_role', '-', '_'))
      else 'VIEWER'
    end,
    nullif(trim(new.raw_user_meta_data ->> 'requested_role_id'), ''),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Existing self-service display updates must not touch the request columns.
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
      or new.requested_role is distinct from old.requested_role
      or new.requested_role_id is distinct from old.requested_role_id
      or new.role_verified_at is distinct from old.role_verified_at
      or new.role_verified_by is distinct from old.role_verified_by
    ) then
    raise exception 'Profile privileges are managed by an administrator.';
  end if;

  return new;
end;
$$;

commit;

-- Administrator promotion example (run manually, never from the client):
--
-- update public.profiles
-- set
--   role = 'GOVERNMENT_OFFICER',
--   government_id = 'GOI-2026-00482',
--   is_government_officer = true,
--   role_verified_at = now(),
--   role_verified_by = auth.uid()
-- where id = '<auth user id>';
