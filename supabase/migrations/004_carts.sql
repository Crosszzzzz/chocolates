-- Migration: 004_carts
-- M11 slice (adapted stack: Supabase + Vercel serverless).
-- Scope: server-side carts (carts + cart_items) so logged-in users keep their
-- cart across devices. localStorage stays as offline cache/fallback; the guest
-- (logged-out) flow never touches these tables.
-- Runs on top of 001_commerce.sql. Works WITH or WITHOUT 002_roles.sql and
-- 003_catalog.sql: it only needs public.profiles(id) + public.products(sku)
-- from 001 (002 adds a column to profiles, 003 adds companies + a column to
-- products — neither is referenced here).
-- Apply manually in the Supabase dashboard (SQL editor).
-- RLS: deny-by-default — NO policies; carts are readable/writable only via
-- service_role (api/cart.ts). Anon/authenticated denied.
-- Rollback: see bottom (drop trigger + function + tables, reverse order).

-- ---------------------------------------------------------------------------
-- 1. Carts: one row per user. Surrogate id PK + unique(user_id) (NOT user_id
-- as PK) so the row identity stays stable if auth bookkeeping ever changes.
-- user_id refs profiles(id) so deleting the profile wipes the cart.
-- ---------------------------------------------------------------------------

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_carts_user_id
  on public.carts (user_id);

-- Keep updated_at fresh on cart touches (upserts from api/cart.ts).
create or replace function public.handle_carts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_carts_updated_at on public.carts;
create trigger trg_carts_updated_at
  before update on public.carts
  for each row execute function public.handle_carts_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Cart items: (cart_id, sku) composite PK prevents duplicate lines.
-- sku refs products(sku) so unknown SKUs can never persist server-side;
-- deleting the cart cascades to its items. Stock/is_active validation lives
-- in api/cart.ts (clamp + Spanish warnings), not in CHECKs, so a product
-- going out of stock never blocks the PUT — it just clamps.
-- ---------------------------------------------------------------------------

create table if not exists public.cart_items (
  cart_id uuid not null references public.carts (id) on delete cascade,
  sku text not null references public.products (sku) on update cascade,
  qty integer not null check (qty > 0),
  primary key (cart_id, sku)
);

create index if not exists idx_cart_items_sku
  on public.cart_items (sku);

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default, like 001/002/003. Enable on both tables, add NO policies.
-- Reads/writes go through api/cart.ts with service_role (bypasses RLS).
-- ---------------------------------------------------------------------------

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

-- Intentionally no policies on carts/cart_items: anon/authenticated denied by default.

-- ---------------------------------------------------------------------------
-- Rollback (run manually, in order):
--   drop trigger if exists trg_carts_updated_at on public.carts;
--   drop function if exists public.handle_carts_updated_at();
--   drop index if exists public.idx_cart_items_sku;
--   drop table if exists public.cart_items;
--   drop index if exists public.idx_carts_user_id;
--   drop table if exists public.carts;
-- 001/002/003 objects untouched: this migration only ADDS (tables, indexes,
-- one trigger function). Client keeps working on localStorage without it.
-- ---------------------------------------------------------------------------
