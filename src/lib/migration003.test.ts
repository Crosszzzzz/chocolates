import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sanity checks for supabase/migrations/003_catalog.sql (no live DB needed).
// The migration itself is applied manually in the Supabase dashboard on top
// of 001_commerce.sql + 002_roles.sql.
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '003_catalog.sql'), 'utf8');

describe('003_catalog.sql', () => {
  it('creates the companies table with unique name + owner profile ref', () => {
    expect(sql).toMatch(/create table/i);
    expect(sql).toMatch(/public\.companies/);
    expect(sql).toMatch(/name text unique/i);
    expect(sql).toMatch(/owner_profile_id uuid references public\.profiles/i);
    expect(sql).toMatch(/created_at/);
  });

  it('extends products with a nullable company_id FK', () => {
    expect(sql).toMatch(/alter table public\.products/i);
    expect(sql).toMatch(/add column/i);
    expect(sql).toMatch(/company_id uuid references public\.companies/i);
    expect(sql).toMatch(/on delete set null/i);
    expect(sql).toMatch(/idx_products_company_id/);
  });

  it('adds pg_trgm search support with a GIN index on products(name_es)', () => {
    expect(sql).toMatch(/create extension if not exists "pg_trgm"/i);
    expect(sql).toMatch(/using gin \(name_es gin_trgm_ops\)/i);
  });

  it('stays deny-by-default: RLS on companies, no new policies, service_role only', () => {
    expect(sql).toMatch(/alter table public\.companies enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/service_role/);
  });

  it('does not touch 001/002 objects (only adds)', () => {
    expect(sql).not.toMatch(/alter table public\.profiles/i);
    expect(sql).not.toMatch(/alter table public\.orders/i);
    expect(sql).not.toMatch(/reserve_order/);
    expect(sql).not.toMatch(/sync_profile_admin_role/);
  });

  it('documents rollback as comments', () => {
    expect(sql).toMatch(/rollback/i);
    expect(sql).toMatch(/drop column if exists company_id/i);
    expect(sql).toMatch(/drop table if exists public\.companies/i);
  });
});
