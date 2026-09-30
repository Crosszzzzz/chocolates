import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog } from './factories';

afterEach(() => {
  vi.unstubAllGlobals();
});

const CURRENT = ['parati-bolsa-fruta', 'parati-caja-bombones', 'parati-tableta-coco', 'sucre-tableta', 'taboada-caja-bombones'];

describe('fetchCatalog merge (DB + static)', () => {
  it('always returns the 5 static SKUs and lets the DB win price/stock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          products: [{ sku: 'sucre-tableta', nameEs: 'Tableta de Chocolate con Leche', priceBOB: 99, stock: 3 }],
        }),
      })),
    );
    const { entries, fromDb } = await fetchCatalog();
    expect(fromDb).toBe(true);
    expect(entries.map((e) => e.sku)).toEqual(CURRENT);
    const sucre = entries.find((e) => e.sku === 'sucre-tableta');
    expect(sucre?.priceBOB).toBe(99);
    expect(sucre?.stock).toBe(3);
    expect(entries).toHaveLength(5);
  });

  it('drops unknown/legacy DB rows so ghosts never resurface', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          products: [{ sku: 'parati-70-silvestre', nameEs: 'Ghost', priceBOB: 1, stock: 1 }],
        }),
      })),
    );
    const { entries, fromDb } = await fetchCatalog();
    expect(fromDb).toBe(true);
    expect(entries.map((e) => e.sku)).toEqual(CURRENT);
  });

  it('falls back to the static 5 when the DB is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('db-down') }));
    const { entries, fromDb } = await fetchCatalog();
    expect(fromDb).toBe(false);
    expect(entries.map((e) => e.sku)).toEqual(CURRENT);
  });
});
