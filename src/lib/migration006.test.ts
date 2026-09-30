import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sanity checks for supabase/migrations/006_seed_current_products.sql (no live DB needed).
// The migration is applied manually on top of 001..005 in the Supabase SQL editor.
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '006_seed_current_products.sql'), 'utf8');
// Executable SQL only (drop `--` comments) for negative assertions.
const code = sql.replace(/--[^\n]*/g, '');

const CURRENT = [
  'parati-bolsa-fruta',
  'parati-caja-bombones',
  'parati-tableta-coco',
  'sucre-tableta',
  'taboada-caja-bombones',
];
const LEGACY = [
  'parati-70-silvestre',
  'parati-singani-gran-reserva',
  'parati-chirimoya-blanco',
  'sucre-colonial-canela',
  'sucre-negro-sal-uyuni',
  'sucre-nuez-macadamia',
  'taboada-submarino-puro',
  'taboada-amargo-almendras',
  'taboada-caja-realeza',
];

describe('006_seed_current_products.sql', () => {
  it('upserts the 5 current SKUs by sku', () => {
    expect(sql).toMatch(/insert into public\.products/i);
    expect(sql).toMatch(/on conflict \(sku\) do update set/i);
    for (const sku of CURRENT) expect(sql).toContain(`'${sku}'`);
  });

  it('conflict branch refreshes name/price/image/is_active but NEVER stock', () => {
    expect(sql).toMatch(/name_es = excluded\.name_es/);
    expect(sql).toMatch(/price_bob = excluded\.price_bob/);
    expect(sql).toMatch(/image_url = excluded\.image_url/);
    expect(sql).toMatch(/is_active = true/);
    expect(sql).not.toMatch(/stock\s*=\s*excluded\.stock/i);
  });

  it('seeds an initial stock for fresh inserts (from FALLBACK_PRICE)', () => {
    expect(sql).toMatch(/'parati-bolsa-fruta',[^)]*38\.00, 20,/);
    expect(sql).toMatch(/'taboada-caja-bombones',[^)]*21\.00, 15,/);
  });

  it('soft-deactivates the 9 legacy SKUs instead of deleting rows', () => {
    expect(sql).toMatch(/update public\.products set is_active = false where sku in \(/i);
    expect(code).not.toMatch(/delete from public\.products/i);
    for (const sku of LEGACY) expect(sql).toContain(`'${sku}'`);
  });

  it('does not reintroduce RLS/policy or touch other 001..005 objects', () => {
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/enable row level security/i);
    expect(code).not.toMatch(/reserve_order/);
    expect(code).not.toMatch(/public\.profiles/);
    expect(code).not.toMatch(/public\.companies/);
    expect(code).not.toMatch(/public\.reviews/);
  });

  it('documents rollback as comments', () => {
    expect(sql).toMatch(/rollback/i);
    expect(sql).toMatch(/update public\.products set is_active = true/i);
  });
});
