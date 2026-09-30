-- Migration: 006_seed_current_products
-- Realign the live catalog to the 5 CURRENT products (admin manages stock+price only).
-- Context: 001_commerce.sql seeded 9 LEGACY SKUs whose ids never shipped in the
-- storefront (src/data/factories.ts). This migration upserts the 5 current SKUs
-- and soft-deactivates the 9 legacy ones so /api/products (is_active=eq.true)
-- returns exactly the current catalog.
-- Runs on top of 001..005. Apply manually in the Supabase SQL editor.
-- Stock policy: stock is set ONLY on fresh insert; re-runs never overwrite stock,
-- so admin stock edits survive (same intent as 001's conflict branch).
-- Rollback: see bottom.

-- ---------------------------------------------------------------------------
-- 1. Upsert the 5 current SKUs (ids mirror src/data/factories.ts FACTORIES).
-- ---------------------------------------------------------------------------

insert into public.products (sku, name_es, price_bob, stock, image_url, is_active) values
  ('parati-bolsa-fruta', 'Bolsa de Chocolates con Fruta', 38.00, 20, '/images/parati-bolsa-fruta.png', true),
  ('parati-caja-bombones', 'Caja de Bombones (Surtido)', 120.00, 20, '/images/parati-caja-bombones.png', true),
  ('parati-tableta-coco', 'Tableta de Cacao (con agregados)', 25.00, 20, '/images/parati-tableta-coco.png', true),
  ('sucre-tableta', 'Tableta de Chocolate con Leche', 16.50, 20, '/images/sucre-tableta.png', true),
  ('taboada-caja-bombones', 'Grageas de Almendra', 21.00, 15, '/images/taboada-caja-bombones.png', true)
on conflict (sku) do update set
  name_es = excluded.name_es,
  price_bob = excluded.price_bob,
  image_url = excluded.image_url,
  is_active = true;

-- NOTE: stock is intentionally NOT in the conflict branch so admin edits survive re-runs.
-- Fresh inserts above use the initial stock from FALLBACK_PRICE in src/data/factories.ts;
-- to reset stock manually: update public.products set stock = <n> where sku = '<sku>';

-- ---------------------------------------------------------------------------
-- 2. Soft-deactivate the 9 legacy SKUs seeded by 001_commerce.sql.
--    Rows are kept (order_items has an FK on sku) but hidden from /api/products.
-- ---------------------------------------------------------------------------

update public.products set is_active = false where sku in (
  'parati-70-silvestre',
  'parati-singani-gran-reserva',
  'parati-chirimoya-blanco',
  'sucre-colonial-canela',
  'sucre-negro-sal-uyuni',
  'sucre-nuez-macadamia',
  'taboada-submarino-puro',
  'taboada-amargo-almendras',
  'taboada-caja-realeza'
);

-- ---------------------------------------------------------------------------
-- Rollback (manual). Reactivate the legacy SKUs; only delete the 5 current rows
-- if they were never ordered (order_items references them by sku).
--   update public.products set is_active = true where sku in (
--     'parati-70-silvestre', 'parati-singani-gran-reserva', 'parati-chirimoya-blanco',
--     'sucre-colonial-canela', 'sucre-negro-sal-uyuni', 'sucre-nuez-macadamia',
--     'taboada-submarino-puro', 'taboada-amargo-almendras', 'taboada-caja-realeza');
--   delete from public.products where sku in (
--     'parati-bolsa-fruta', 'parati-caja-bombones', 'parati-tableta-coco',
--     'sucre-tableta', 'taboada-caja-bombones');
-- ---------------------------------------------------------------------------
