import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sanity checks for supabase/migrations/004_carts.sql (no live DB needed).
// The migration itself is applied manually in the Supabase dashboard on top
// of 001_commerce.sql (works with or without 002_roles.sql / 003_catalog.sql).
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '004_carts.sql'), 'utf8');

describe('004_carts.sql', () => {
  it('creates the carts table with surrogate id + unique user_id refs profiles', () => {
    expect(sql).toMatch(/create table/i);
    expect(sql).toMatch(/public\.carts/);
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
    expect(sql).toMatch(/user_id uuid unique not null references public\.profiles \(id\) on delete cascade/i);
    expect(sql).toMatch(/created_at/);
    expect(sql).toMatch(/updated_at/);
  });

  it('creates cart_items with a (cart_id, sku) PK, cascade delete, and qty > 0', () => {
    expect(sql).toMatch(/public\.cart_items/);
    expect(sql).toMatch(/cart_id uuid not null references public\.carts \(id\) on delete cascade/i);
    expect(sql).toMatch(/sku text not null references public\.products \(sku\)/i);
    expect(sql).toMatch(/qty integer not null check \(qty > 0\)/i);
    expect(sql).toMatch(/primary key \(cart_id, sku\)/i);
  });

  it('stays deny-by-default: RLS on both tables, no new policies, service_role only', () => {
    expect(sql).toMatch(/alter table public\.carts enable row level security/i);
    expect(sql).toMatch(/alter table public\.cart_items enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/service_role/);
  });

  it('does not touch 001/002/003 objects (only adds)', () => {
    expect(sql).not.toMatch(/alter table public\.products/i);
    expect(sql).not.toMatch(/alter table public\.profiles/i);
    expect(sql).not.toMatch(/alter table public\.orders/i);
    expect(sql).not.toMatch(/reserve_order/);
    expect(sql).not.toMatch(/sync_profile_admin_role/);
    expect(sql).not.toMatch(/public\.companies/);
  });

  it('documents rollback as comments', () => {
    expect(sql).toMatch(/rollback/i);
    expect(sql).toMatch(/drop table if exists public\.cart_items/i);
    expect(sql).toMatch(/drop table if exists public\.carts/i);
  });

  it('works without 002/003: only 001 columns are referenced', () => {
    expect(sql).not.toMatch(/\brole\b.*references|references.*\brole\b/i);
    expect(sql).not.toMatch(/company_id/);
  });
});
