-- Migration: 002_roles
-- M9 slice (adapted stack: Supabase Auth, no new backend).
-- Scope: extend public.profiles with role ('turista' | 'empresa' | 'admin'),
-- keep is_admin in sync via trigger, backfill existing rows.
-- RLS: deny-by-default like 001 — NO new policies; profiles stay readable
-- only via service_role (api/me.ts). Anon/authenticated reads stay denied.
-- Apply manually in the Supabase dashboard on top of 001_commerce.sql.
-- Rollback: see bottom (drop trigger + function + column).

-- ---------------------------------------------------------------------------
-- 1. Role column: NOT NULL with safe default so existing rows are covered.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'turista'
  check (role in ('turista', 'empresa', 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Backfill: rows predating the default (or with drift) go to 'turista'.
-- Preserve already-flagged admins: is_admin = true  =>  role = 'admin'.
-- ---------------------------------------------------------------------------

update public.profiles
  set role = 'turista'
  where role not in ('turista', 'empresa', 'admin');

update public.profiles
  set role = 'admin'
  where is_admin is true and role <> 'admin';

-- HINT: promote known admins from the ADMIN_EMAILS allow-list (edit + run manually):
-- update public.profiles as p
--   set role = 'admin'
--   from auth.users as u
--   where p.id = u.id
--     and lower(u.email) in ('admin@tusitio.bo');

-- ---------------------------------------------------------------------------
-- 3. Sync trigger: admin role <=> is_admin true (single source: role).
-- ---------------------------------------------------------------------------

create or replace function public.sync_profile_admin_role()
returns trigger
language plpgsql
as $$
begin
  new.is_admin := (new.role = 'admin');
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_admin_role on public.profiles;
create trigger trg_profiles_sync_admin_role
  before insert or update on public.profiles
  for each row execute function public.sync_profile_admin_role();

-- Final consistency pass (fires the trigger; no-op when already in sync).
update public.profiles set is_admin = (role = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: intentionally no policies on profiles (deny-by-default, like 001).
-- Reads go through api/me.ts with service_role (bypasses RLS).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Rollback (run manually, in order):
--   drop trigger if exists trg_profiles_sync_admin_role on public.profiles;
--   drop function if exists public.sync_profile_admin_role();
--   alter table public.profiles drop column if exists role;
-- ---------------------------------------------------------------------------
