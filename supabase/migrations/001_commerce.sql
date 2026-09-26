-- Migration: 001_commerce
-- PR1 slice of mvp-completo (Foundation DB + types). Stacked-to-main, targets main.
-- Scope: products/orders/profiles, deny-by-default RLS, atomic reserve_order RPC, seed (9 SKUs, BOB).
-- Rollback: drop function + tables in reverse order (see bottom), redeploy prior Vercel commit.
-- Notes: service_role bypasses RLS; anon key is read-only via explicit SELECT policy on products.

-- pgcrypto provides gen_random_uuid() on older Postgres; safe if already installed.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name_es text not null,
  price_bob numeric(10, 2) not null check (price_bob > 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  total_bob numeric(10, 2) not null check (total_bob >= 0),
  fulfillment text not null check (fulfillment in ('pickup', 'delivery-sucre')),
  address text,
  status text not null default 'reserved' check (status in ('reserved', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint orders_delivery_requires_address
    check (
      fulfillment = 'pickup'
      or (fulfillment = 'delivery-sucre' and address is not null and char_length(btrim(address)) > 0)
    )
);

create table if not exists public.order_items (
  order_id uuid not null references public.orders (id) on delete cascade,
  sku text not null references public.products (sku) on update cascade,
  qty integer not null check (qty > 0),
  unit_price_bob numeric(10, 2) not null check (unit_price_bob > 0),
  primary key (order_id, sku)
);

create index if not exists idx_order_items_order_id on public.order_items (order_id);
create index if not exists idx_products_sku_active on public.products (sku) where is_active = true;
create index if not exists idx_orders_created_at on public.orders (created_at desc);

-- Keep updated_at fresh on product edits (admin CRUD lands in PR5).
create or replace function public.handle_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.handle_products_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default. Only explicit allow is anon/authenticated SELECT on active products.
-- All writes go through api/* with service_role (bypasses RLS). No other policies = denied.
-- ---------------------------------------------------------------------------

alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists products_read_active on public.products;
create policy products_read_active
  on public.products for select
  to anon, authenticated
  using (is_active = true);

-- Intentionally no policies on profiles/orders/order_items: anon/authenticated denied by default.

-- ---------------------------------------------------------------------------
-- Atomic reservation RPC: single transaction, server-side price recompute.
-- Locks each product row FOR UPDATE, validates stock, inserts order + items,
-- decrements stock. Tampered client totals are ignored (total recomputed from DB).
-- Spanish error messages surface directly to the UI (PR4 maps them to error_es).
-- ---------------------------------------------------------------------------

create or replace function public.reserve_order(
  p_items jsonb,
  p_fulfillment text,
  p_address text default null
)
returns table (order_id uuid, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(10, 2) := 0;
  v_order_id uuid;
  r jsonb;
  v_sku text;
  v_qty integer;
  v_price numeric(10, 2);
  v_stock integer;
begin
  if p_fulfillment not in ('pickup', 'delivery-sucre') then
    raise exception 'Modalidad de entrega no válida (solo pickup o delivery-sucre)';
  end if;

  if p_fulfillment = 'delivery-sucre' and (p_address is null or char_length(btrim(p_address)) = 0) then
    raise exception 'Dirección requerida para delivery en Sucre';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrito vacío';
  end if;

  insert into public.orders (total_bob, fulfillment, address, status)
  values (0, p_fulfillment, nullif(btrim(coalesce(p_address, '')), ''), 'reserved')
  returning id into v_order_id;

  for r in select * from jsonb_array_elements(p_items)
  loop
    v_sku := r ->> 'sku';
    v_qty := coalesce((r ->> 'qty')::integer, 0);

    if v_sku is null or btrim(v_sku) = '' then
      raise exception 'SKU inválido en carrito';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad inválida para SKU %', v_sku;
    end if;

    select p.price_bob, p.stock into v_price, v_stock
    from public.products as p
    where p.sku = v_sku
    for update;

    if not found then
      raise exception 'Producto no encontrado: %', v_sku;
    end if;

    if v_stock < v_qty then
      raise exception 'Sin stock para SKU % (disponible: %)', v_sku, v_stock;
    end if;

    v_total := v_total + (v_price * v_qty);

    insert into public.order_items (order_id, sku, qty, unit_price_bob)
    values (v_order_id, v_sku, v_qty, v_price);

    update public.products
    set stock = stock - v_qty
    where sku = v_sku;
  end loop;

  if v_total <= 0 then
    raise exception 'Total inválido';
  end if;

  update public.orders set total_bob = v_total where id = v_order_id;

  return query select v_order_id, v_total;
end;
$$;

-- Security definer with explicit grants; validation lives inside the function.
revoke all on function public.reserve_order(jsonb, text, text) from public;
grant execute on function public.reserve_order(jsonb, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed: 9 SKUs mirroring src/data/factories.ts ids. Prices in BOB.
-- One SKU (parati-chirimoya-blanco) seeds with stock 0 to exercise "Sin stock".
-- Photos deferred to PR5 (/public placeholders); image_url stays null in PR1.
-- ---------------------------------------------------------------------------

insert into public.products (sku, name_es, price_bob, stock, image_url, is_active) values
  ('parati-70-silvestre', 'Barra 70% Cacao Silvestre Amazónico', 45.00, 24, null, true),
  ('parati-singani-gran-reserva', 'Tableta Gourmet con Singani Gran Reserva', 52.50, 18, null, true),
  ('parati-chirimoya-blanco', 'Barra Cacao Blanco & Chirimoya Real', 38.00, 0, null, true),
  ('sucre-colonial-canela', 'Barra Colonial Taza & Canela de Ceilán', 32.00, 30, null, true),
  ('sucre-negro-sal-uyuni', 'Chocolate Oscuro 75% Flor de Sal de Uyuni', 48.00, 15, null, true),
  ('sucre-nuez-macadamia', 'Tableta Suprema de Cacao 55% y Macadamias', 42.00, 12, null, true),
  ('taboada-submarino-puro', 'Barra Submarino Clásica 80% Pasta Pura', 28.00, 40, null, true),
  ('taboada-amargo-almendras', 'Tableta Extra Fina con Castañas Amazónicas', 39.50, 22, null, true),
  ('taboada-caja-realeza', 'Edición de Colección Bombones Taboada', 85.00, 10, null, true)
on conflict (sku) do update set
  name_es = excluded.name_es,
  price_bob = excluded.price_bob,
  image_url = excluded.image_url,
  is_active = excluded.is_active;

-- NOTE: stock is intentionally not overwritten on conflict so admin edits (PR5) survive re-seed.
-- To reset stock manually: update public.products set stock = <n> where sku = '<sku>';

-- ---------------------------------------------------------------------------
-- Rollback (run manually, reverse order):
--   drop function if exists public.reserve_order(jsonb, text, text);
--   drop table if exists public.order_items;
--   drop table if exists public.orders;
--   drop table if exists public.profiles;
--   drop table if exists public.products;
-- Static fallback in src/data/factories.ts keeps the shop rendering without DB.
-- ---------------------------------------------------------------------------
