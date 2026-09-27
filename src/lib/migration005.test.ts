import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sanity checks for supabase/migrations/005_ratings.sql (no live DB needed).
// The migration itself is applied manually in the Supabase dashboard on top
// of 001_commerce.sql + 002_roles.sql + 003_catalog.sql + 004_carts.sql.
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '005_ratings.sql'), 'utf8');

describe('005_ratings.sql', () => {
  it('creates the reviews table with the M14 columns and checks', () => {
    expect(sql).toMatch(/create table/i);
    expect(sql).toMatch(/public\.reviews/);
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
    expect(sql).toMatch(/product_sku text not null references public\.products \(sku\)/i);
    expect(sql).toMatch(/user_id uuid not null references public\.profiles \(id\)/i);
    expect(sql).toMatch(/rating integer not null check \(rating >= 1 and rating <= 5\)/i);
    expect(sql).toMatch(/comment text not null default ''/i);
    expect(sql).toMatch(/status text not null default 'pending' check \(status in \('pending', 'approved', 'rejected'\)\)/i);
    expect(sql).toMatch(/created_at/);
    expect(sql).toMatch(/unique \(product_sku, user_id\)/i);
  });

  it('adds the buyer link on orders (nullable user_id + index) for purchase checks', () => {
    expect(sql).toMatch(/alter table public\.orders/i);
    expect(sql).toMatch(/add column if not exists user_id uuid references public\.profiles \(id\)/i);
    expect(sql).toMatch(/idx_orders_user_id/);
  });

  it('stays deny-by-default: RLS on reviews, no new policies, service_role only', () => {
    expect(sql).toMatch(/alter table public\.reviews enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/service_role/);
  });

  it('does not touch 001/002/003/004 objects beyond the additive buyer link', () => {
    expect(sql).not.toMatch(/alter table public\.products/i);
    expect(sql).not.toMatch(/alter table public\.profiles/i);
    expect(sql).not.toMatch(/reserve_order/);
    expect(sql).not.toMatch(/sync_profile_admin_role/);
    expect(sql).not.toMatch(/public\.companies/);
    expect(sql).not.toMatch(/public\.carts/);
    expect(sql).not.toMatch(/public\.cart_items/);
  });

  it('documents rollback as comments', () => {
    expect(sql).toMatch(/rollback/i);
    expect(sql).toMatch(/drop table if exists public\.reviews/i);
    expect(sql).toMatch(/alter table public\.orders drop column if exists user_id/i);
  });

  it('creates lookup indexes for the approved-list and moderation queue', () => {
    expect(sql).toMatch(/idx_reviews_product_status/);
    expect(sql).toMatch(/idx_reviews_status_created/);
  });
});
