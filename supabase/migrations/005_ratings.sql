-- Migration: 005_ratings
-- M14 slice (adapted stack: Supabase + Vercel serverless).
-- Scope: product reviews (reviews table) + buyer link on orders (orders.user_id).
-- Runs on top of 001_commerce.sql + 002_roles.sql + 003_catalog.sql + 004_carts.sql.
-- Apply manually in the Supabase dashboard (SQL editor).
-- Writes go through api/reviews.ts with service_role (bypasses RLS).
-- RLS: deny-by-default — NO policies; anon/authenticated denied, service_role only.
-- Rollback: see bottom (drop table + column + indexes, reverse order).

-- ---------------------------------------------------------------------------
-- 1. Buyer link on orders: 001 orders carry no user reference, so verified
-- purchase checks (api/reviews.ts POST) need it. Nullable so pre-005 orders
-- and guest checkouts keep working; api/checkout.ts fills it best-effort when
-- the client sends a verified userId. Deleting the profile keeps the order
-- (set null) for accounting.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists user_id uuid references public.profiles (id) on delete set null;

create index if not exists idx_orders_user_id
  on public.orders (user_id);

-- ---------------------------------------------------------------------------
-- 2. Reviews: one row per (user, product). New rows start 'pending';
-- api/reviews.ts PATCH (admin only) moves them to 'approved'/'rejected'.
-- product_sku mirrors order_items (on update cascade); deleting a product
-- keeps its reviews would orphan them, so cascade on delete like order lines
-- would lose history — instead restrict is overkill for this scale:
-- cascade keeps FK hygiene simple (admin soft-deletes via is_active anyway).
-- ---------------------------------------------------------------------------

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_sku text not null references public.products (sku) on update cascade on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (product_sku, user_id)
);

create index if not exists idx_reviews_product_status
  on public.reviews (product_sku, status);

create index if not exists idx_reviews_status_created
  on public.reviews (status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default, like 001/002/003/004. Enable, add NO policies.
-- Reads/writes go through api/reviews.ts with service_role (bypasses RLS).
-- ---------------------------------------------------------------------------

alter table public.reviews enable row level security;

-- Intentionally no policies on reviews: anon/authenticated denied by default.

-- ---------------------------------------------------------------------------
-- Rollback (run manually, in order):
--   drop index if exists public.idx_reviews_status_created;
--   drop index if exists public.idx_reviews_product_status;
--   drop table if exists public.reviews;
--   drop index if exists public.idx_orders_user_id;
--   alter table public.orders drop column if exists user_id;
-- 001/002/003/004 objects untouched: this migration only ADDS (table, column,
-- indexes). The shop keeps working without it (reviews section stays empty).
-- ---------------------------------------------------------------------------
