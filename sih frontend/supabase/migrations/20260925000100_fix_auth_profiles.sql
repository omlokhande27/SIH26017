-- LandGuard AI: profile schema, account provisioning, and RLS.
-- Run this once in Supabase Dashboard > SQL Editor.
-- New accounts always start as VIEWER. Promote trusted users from the
-- Supabase admin dashboard by setting profiles.role and profiles.government_id.

begin;

alter table public.profiles
  add column if not exists designation text,
  add column if not exists government_id text,
  add column if not exists is_government_officer boolean not null default false;

alter table public.profiles
  alter column role set default 'VIEWER';

create unique index if not exists profiles_government_id_unique
  on public.profiles (upper(government_id))
  where government_id is not null and government_id <> '';

-- Backfill Auth users that do not have a profile yet. Existing profile roles
-- are preserved; only missing display fields are filled in.
insert into public.profiles (
  id,
  full_name,
  role,
  department,
  designation,
  government_id,
  is_government_officer,
  created_at,
  updated_at
)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(users.email, users.phone, 'User'), '@', 1)
  ),
  case
    when upper(replace(coalesce(users.raw_app_meta_data ->> 'role', ''), '-', '_'))
      in ('GOVERNMENT_OFFICER', 'PROJECT_MANAGER')
      then upper(replace(users.raw_app_meta_data ->> 'role', '-', '_'))
    else 'VIEWER'
  end,
  coalesce(nullif(trim(users.raw_user_meta_data ->> 'department'), ''), 'Land Acquisition Department'),
  nullif(trim(users.raw_user_meta_data ->> 'designation'), ''),
  nullif(trim(users.raw_app_meta_data ->> 'government_id'), ''),
  case
    when upper(replace(coalesce(users.raw_app_meta_data ->> 'role', ''), '-', '_'))
      in ('GOVERNMENT_OFFICER', 'PROJECT_MANAGER')
    then true
    else false
  end,
  coalesce(users.created_at, now()),
  now()
from auth.users as users
on conflict (id) do update
set
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  department = coalesce(public.profiles.department, excluded.department),
  updated_at = now();

-- Automatically provision a safe profile for every future Auth signup.
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
    case
      when upper(replace(coalesce(new.raw_app_meta_data ->> 'role', ''), '-', '_'))
        in ('GOVERNMENT_OFFICER', 'PROJECT_MANAGER')
        then upper(replace(new.raw_app_meta_data ->> 'role', '-', '_'))
      else 'VIEWER'
    end,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'department'), ''), 'Land Acquisition Department'),
    nullif(trim(new.raw_user_meta_data ->> 'designation'), ''),
    nullif(trim(new.raw_app_meta_data ->> 'government_id'), ''),
    case
      when upper(replace(coalesce(new.raw_app_meta_data ->> 'role', ''), '-', '_'))
        in ('GOVERNMENT_OFFICER', 'PROJECT_MANAGER')
      then true
      else false
    end,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Authenticated users can read only their own profile. They cannot promote
-- their own role or change their own government ID through PostgREST.
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

commit;
