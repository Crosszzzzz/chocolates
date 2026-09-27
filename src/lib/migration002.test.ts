import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sanity checks for supabase/migrations/002_roles.sql (no live DB needed).
// The migration itself is applied manually in the Supabase dashboard.
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '002_roles.sql'), 'utf8');

describe('002_roles.sql', () => {
  it('extends profiles with a checked role column defaulting to turista', () => {
    expect(sql).toMatch(/alter table public\.profiles/i);
    expect(sql).toMatch(/add column/i);
    expect(sql).toMatch(/\brole\b/);
    expect(sql).toMatch(/'turista'/);
    expect(sql).toMatch(/'empresa'/);
    expect(sql).toMatch(/'admin'/);
    expect(sql).toMatch(/check\s*\(role in/i);
    expect(sql).toMatch(/not null default 'turista'/i);
  });

  it('keeps is_admin in sync via trigger', () => {
    expect(sql).toMatch(/sync_profile_admin_role/);
    expect(sql).toMatch(/trg_profiles_sync_admin_role/);
    expect(sql).toMatch(/create trigger/i);
    expect(sql).toMatch(/is_admin/);
  });

  it('backfills existing rows and hints ADMIN_EMAILS promotion', () => {
    expect(sql).toMatch(/update public\.profiles/i);
    expect(sql).toMatch(/ADMIN_EMAILS/);
  });

  it('stays deny-by-default: no new RLS policies', () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it('documents rollback as comments', () => {
    expect(sql).toMatch(/drop trigger if exists/i);
    expect(sql).toMatch(/drop column if exists role/i);
  });
});
