-- Migration: 003_catalog
-- M10 slice (adapted stack: Supabase + Vercel serverless).
-- Scope: companies table, products.company_id FK, pg_trgm search index.
-- Runs on top of 001_commerce.sql + 002_roles.sql. Apply manually in the
-- Supabase dashboard (SQL editor). products.is_active already exists (001).
-- RLS: deny-by-default — NO new policies; companies is readable/writable only
-- via service_role (api/companies.ts, api/admin.ts). Anon/authenticated denied.
-- Rollback: see bottom (drop indexes + column + table, reverse order).

-- ---------------------------------------------------------------------------
-- 1. Search support: pg_trgm for trigram similarity + GIN index on name_es.
-- api/search.ts uses ilike (works without trigrams); the index keeps it fast
-- as the catalog grows and enables future similarity() ranking.
-- ---------------------------------------------------------------------------

create extension if not exists "pg_trgm";

create index if not exists idx_products_name_es_trgm
  on public.products using gin (name_es gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Companies directory: multi-seller catalog (M10).
-- owner_profile_id is nullable so dashboard-seeded companies can exist before
-- their owner signs up; set null when the owner profile is deleted.
-- ---------------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (char_length(btrim(name)) > 0),
  owner_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_companies_owner
  on public.companies (owner_profile_id);

-- ---------------------------------------------------------------------------
-- 3. products.company_id: nullable FK so pre-M10 rows (001 seed) keep working.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists company_id uuid references public.companies (id) on delete set null;

create index if not exists idx_products_company_id
  on public.products (company_id);

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default, like 001/002. Enable on companies, add NO policies.
-- Reads/writes go through api/* with service_role (bypasses RLS).
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;

-- Intentionally no policies on companies: anon/authenticated denied by default.

-- ---------------------------------------------------------------------------
-- Rollback (run manually, in order):
--   drop index if exists public.idx_products_company_id;
--   alter table public.products drop column if exists company_id;
--   drop index if exists public.idx_companies_owner;
--   drop index if exists public.idx_products_name_es_trgm;
--   drop table if exists public.companies;
--   -- Optional (shared extension, keep when in doubt):
--   -- drop extension if exists "pg_trgm";
-- 001/002 objects untouched: this migration only ADDS (table, column, indexes).
-- ---------------------------------------------------------------------------
