import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE,
  ROLE_LABEL_ES,
  ROLE_VALUES,
  isAdminRole,
  isEmpresaRole,
  isTuristaRole,
  normalizeRole,
} from './roles';

describe('normalizeRole', () => {
  it('keeps each valid role', () => {
    expect(normalizeRole('turista')).toBe('turista');
    expect(normalizeRole('empresa')).toBe('empresa');
    expect(normalizeRole('admin')).toBe('admin');
  });

  it('trims and lowercases', () => {
    expect(normalizeRole('  Admin ')).toBe('admin');
    expect(normalizeRole('EMPRESA')).toBe('empresa');
  });

  it('defaults unknown, null and undefined to turista', () => {
    expect(normalizeRole('superuser')).toBe('turista');
    expect(normalizeRole('')).toBe('turista');
    expect(normalizeRole(null)).toBe('turista');
    expect(normalizeRole(undefined)).toBe('turista');
    expect(normalizeRole(42)).toBe('turista');
  });

  it('exposes turista as the default role', () => {
    expect(DEFAULT_ROLE).toBe('turista');
    expect(ROLE_VALUES).toEqual(['turista', 'empresa', 'admin']);
  });
});

describe('role helpers', () => {
  it('isAdminRole matches only admin', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('empresa')).toBe(false);
    expect(isAdminRole('turista')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it('isEmpresaRole matches only empresa', () => {
    expect(isEmpresaRole('empresa')).toBe(true);
    expect(isEmpresaRole('admin')).toBe(false);
    expect(isEmpresaRole('turista')).toBe(false);
    expect(isEmpresaRole(null)).toBe(false);
  });

  it('isTuristaRole matches only turista', () => {
    expect(isTuristaRole('turista')).toBe(true);
    expect(isTuristaRole('empresa')).toBe(false);
    expect(isTuristaRole('admin')).toBe(false);
    expect(isTuristaRole(null)).toBe(false);
  });
});

describe('ROLE_LABEL_ES', () => {
  it('labels every role in Spanish', () => {
    expect(ROLE_LABEL_ES.turista).toBe('Turista');
    expect(ROLE_LABEL_ES.empresa).toBe('Empresa');
    expect(ROLE_LABEL_ES.admin).toBe('Administrador');
  });
});
