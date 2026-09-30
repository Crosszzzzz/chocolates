import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterCatalogLocal, searchCatalog } from './catalog';
import type { CatalogEntry } from '../data/factories';

const ENTRIES: CatalogEntry[] = [
  { sku: 'parati-70-silvestre', nameEs: 'Barra 70% Cacao Silvestre Amazónico', priceBOB: 45, stock: 24 },
  { sku: 'sucre-tableta', nameEs: 'Tableta de Chocolate con Leche', priceBOB: 16.50, stock: 20 },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('filterCatalogLocal', () => {
  it('matches name case-insensitively', () => {
    expect(filterCatalogLocal(ENTRIES, 'tableta')).toEqual([ENTRIES[1]]);
    expect(filterCatalogLocal(ENTRIES, 'CACAO')).toEqual([ENTRIES[0]]);
  });

  it('matches sku and trims the query', () => {
    expect(filterCatalogLocal(ENTRIES, '  parati-70  ')).toEqual([ENTRIES[0]]);
  });

  it('returns [] for empty, non-string, or unmatched queries', () => {
    expect(filterCatalogLocal(ENTRIES, '')).toEqual([]);
    expect(filterCatalogLocal(ENTRIES, '   ')).toEqual([]);
    expect(filterCatalogLocal(ENTRIES, null)).toEqual([]);
    expect(filterCatalogLocal(ENTRIES, 42)).toEqual([]);
    expect(filterCatalogLocal(ENTRIES, 'trufa-inexistente')).toEqual([]);
  });
});

describe('searchCatalog', () => {
  it('returns [] without network for empty queries', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchCatalog('   ')).resolves.toEqual({ entries: [], fromDb: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns live /api/search results when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        expect(String(url)).toContain('/api/search?q=cacao');
        return { ok: true, json: async () => ({ products: [ENTRIES[0]] }) };
      }),
    );
    await expect(searchCatalog('cacao')).resolves.toEqual({ entries: [ENTRIES[0]], fromDb: true });
  });

  it('falls back to fetchCatalog with client-side filter when /api/search is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('/api/search')) throw new Error('search-down');
        if (u.includes('/api/products')) return { ok: true, json: async () => ({ products: ENTRIES }) };
        throw new Error(`unexpected fetch: ${u}`);
      }),
    );
    await expect(searchCatalog('tableta')).resolves.toEqual({ entries: [ENTRIES[1]], fromDb: false });
  });
});
