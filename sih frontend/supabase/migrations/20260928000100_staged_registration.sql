-- LandGuard AI: staged registration support.
-- Adds location and job details captured during registration, plus a safe
-- identifier lookup used by the "Verify" buttons.
-- Run after 20260927000100_role_specific_registration.sql in Supabase SQL Editor.
--
-- Security model is unchanged:
--   * profiles.role still defaults to VIEWER and is only set by an administrator.
--   * check_landguard_identifier returns a boolean only. It never returns
--     profile rows, names, or emails, so it leaks nothing about existing users.

begin;

alter table public.profiles
  add column if not exists state_code text,
  add column if not exists district text,
  add column if not exists profession text,
  add column if not exists officer_level text,
  add column if not exists manager_id text,
  add column if not exists assigned_project_id text;

alter table public.profiles
  drop constraint if exists profiles_officer_level_valid;

alter table public.profiles
  add constraint profiles_officer_level_valid
  check (officer_level is null or officer_level in ('NATIONAL', 'STATE', 'DISTRICT'));

-- Identifier lookups for the verification step.
create index if not exists profiles_manager_id_idx
  on public.profiles (upper(manager_id))
  where manager_id is not null and manager_id <> '';

create index if not exists profiles_officer_level_idx
  on public.profiles (officer_level)
  where officer_level is not null;

-- Returns true when the identifier is already taken.
-- SECURITY DEFINER is required because profiles is readable only by the owner.
-- The function is deliberately narrow: boolean in, boolean out.
create or replace function public.check_landguard_identifier(
  p_kind text,
  p_identifier text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
  taken boolean;
begin
  normalized := upper(trim(coalesce(p_identifier, '')));
  if normalized = '' then
    return false;
  end if;

  if lower(trim(coalesce(p_kind, ''))) = 'officer' then
    select exists (
      select 1
      from public.profiles
      where upper(coalesce(government_id, '')) = normalized
         or upper(coalesce(requested_role_id, '')) = normalized
    ) into taken;
  elsif lower(trim(coalesce(p_kind, ''))) = 'manager' then
    select exists (
      select 1
      from public.profiles
      where upper(coalesce(manager_id, '')) = normalized
         or upper(coalesce(requested_role_id, '')) = normalized
    ) into taken;
  else
    raise exception 'Unsupported identifier kind.';
  end if;

  return taken;
end;
$$;

revoke all on function public.check_landguard_identifier(text, text) from public;
grant execute on function public.check_landguard_identifier(text, text) to anon, authenticated;

-- Capture the staged registration details on the profile row. The role stays
-- VIEWER: an administrator still promotes the account after review.
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
    state_code,
    district,
    profession,
    officer_level,
    manager_id,
    assigned_project_id,
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
    case
      when upper(replace(coalesce(new.raw_user_meta_data ->> 'requested_role', ''), '-', '_')) = 'GOVERNMENT_OFFICER'
      then nullif(trim(new.raw_user_meta_data ->> 'officer_id'), '')
      else null
    end,
    false,
    case
      when upper(replace(coalesce(new.raw_user_meta_data ->> 'requested_role', ''), '-', '_'))
        in ('GOVERNMENT_OFFICER', 'PROJECT_MANAGER', 'VIEWER')
      then upper(replace(new.raw_user_meta_data ->> 'requested_role', '-', '_'))
      else 'VIEWER'
    end,
    case
      when upper(replace(coalesce(new.raw_user_meta_data ->> 'requested_role', ''), '-', '_')) = 'GOVERNMENT_OFFICER'
      then nullif(trim(new.raw_user_meta_data ->> 'officer_id'), '')
      when upper(replace(coalesce(new.raw_user_meta_data ->> 'requested_role', ''), '-', '_')) = 'PROJECT_MANAGER'
      then nullif(trim(new.raw_user_meta_data ->> 'manager_id'), '')
      else null
    end,
    nullif(upper(trim(new.raw_user_meta_data ->> 'state_code')), ''),
    nullif(trim(new.raw_user_meta_data ->> 'district'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'profession'), ''),
    case
      when upper(coalesce(new.raw_user_meta_data ->> 'officer_level', '')) in ('NATIONAL', 'STATE', 'DISTRICT')
      then upper(new.raw_user_meta_data ->> 'officer_level')
      else null
    end,
    case
      when upper(replace(coalesce(new.raw_user_meta_data ->> 'requested_role', ''), '-', '_')) = 'PROJECT_MANAGER'
      then nullif(trim(new.raw_user_meta_data ->> 'manager_id'), '')
      else null
    end,
    nullif(trim(new.raw_user_meta_data ->> 'assigned_project_id'), ''),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Extend the privilege guard so self-service profile updates cannot change
-- the newly added registration or approval columns.
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
      or new.state_code is distinct from old.state_code
      or new.district is distinct from old.district
      or new.profession is distinct from old.profession
      or new.officer_level is distinct from old.officer_level
      or new.manager_id is distinct from old.manager_id
      or new.assigned_project_id is distinct from old.assigned_project_id
    ) then
    raise exception 'Profile privileges are managed by an administrator.';
  end if;

  return new;
end;
$$;

commit;
