import { describe, expect, it } from 'vitest';
import { normalizeApiRole, parseMeBody, pickRoleFromProfileRow } from '../../api/me';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('parseMeBody', () => {
  it('accepts a valid uuid userId', () => {
    expect(parseMeBody({ userId: UUID })).toEqual({ ok: true, userId: UUID });
  });

  it('rejects missing, empty and malformed userIds in Spanish', () => {
    for (const body of [{}, { userId: '' }, { userId: '   ' }, { userId: 'not-a-uuid' }, { userId: 42 }, null]) {
      const parsed = parseMeBody(body);
      expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.errorEs).toBe('Sesión no válida, inicia sesión de nuevo');
    }
  });
});

describe('pickRoleFromProfileRow', () => {
  it('returns each valid role', () => {
    expect(pickRoleFromProfileRow({ role: 'admin' })).toBe('admin');
    expect(pickRoleFromProfileRow({ role: 'empresa' })).toBe('empresa');
    expect(pickRoleFromProfileRow({ role: 'turista' })).toBe('turista');
  });

  it('falls back to the pre-002 is_admin flag', () => {
    expect(pickRoleFromProfileRow({ is_admin: true })).toBe('admin');
    expect(pickRoleFromProfileRow({ is_admin: false })).toBe('turista');
  });

  it('defaults missing rows and garbage to turista', () => {
    expect(pickRoleFromProfileRow(null)).toBe('turista');
    expect(pickRoleFromProfileRow(undefined)).toBe('turista');
    expect(pickRoleFromProfileRow([])).toBe('turista');
    expect(pickRoleFromProfileRow({ role: 'superuser' })).toBe('turista');
    expect(pickRoleFromProfileRow({ role: 42 })).toBe('turista');
  });
});

describe('normalizeApiRole', () => {
  it('normalizes case and rejects garbage', () => {
    expect(normalizeApiRole('ADMIN')).toBe('admin');
    expect(normalizeApiRole('nope')).toBe('turista');
    expect(normalizeApiRole(null)).toBe('turista');
  });
});
