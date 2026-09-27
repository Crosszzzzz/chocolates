import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
  buildSearchEndpoint,
  parseSearchQuery,
  readQueryQ,
  sanitizeLikeTerm,
  SEARCH_LIMIT,
} from '../../api/search';

type Req = Parameters<typeof handler>[0];
type Res = Parameters<typeof handler>[1];

function makeRes(): { res: Res; calls: { code: number; body: unknown }[] } {
  const calls: { code: number; body: unknown }[] = [];
  const res: Res = {
    setHeader: () => {},
    status: (code: number) => {
      return {
        setHeader: () => {},
        status: () => res,
        json: (body: unknown) => {
          calls.push({ code, body });
        },
        end: () => {},
      };
    },
    json: () => {},
    end: () => {},
  };
  return { res, calls };
}

type Route = { includes: string; ok?: boolean; status?: number; data?: unknown };
function mockFetch(routes: Route[]): { url: string; init: unknown }[] {
  const calls: { url: string; init: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init: unknown) => {
      const u = String(url);
      calls.push({ url: u, init });
      const route = routes.find((r) => u.includes(r.includes));
      if (!route) throw new Error(`unexpected fetch: ${u}`);
      return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.data ?? null };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('parseSearchQuery', () => {
  it('trims and caps length, rejects non-strings', () => {
    expect(parseSearchQuery('  cacao  ')).toBe('cacao');
    expect(parseSearchQuery(null)).toBe('');
    expect(parseSearchQuery(42)).toBe('');
    expect(parseSearchQuery('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('sanitizeLikeTerm', () => {
  it('strips PostgREST filter breakers and wildcards', () => {
    expect(sanitizeLikeTerm('a*b(c)d,e%f\\g')).toBe('abcdefg');
    expect(sanitizeLikeTerm('  cacao   silvestre  ')).toBe('cacao silvestre');
  });
});

describe('readQueryQ', () => {
  it('reads q from query, first value wins', () => {
    expect(readQueryQ({ q: 'cacao' })).toBe('cacao');
    expect(readQueryQ({ q: ['a', 'b'] })).toBe('a');
    expect(readQueryQ(undefined)).toBe(undefined);
  });
});

describe('buildSearchEndpoint', () => {
  it('queries only active products with ilike on name_es/sku, capped', () => {
    const url = buildSearchEndpoint('https://x.supabase.co', 'cacao');
    expect(url).toContain('/rest/v1/products?');
    expect(url).toContain('is_active=eq.true');
    expect(url).toContain('or=(name_es.ilike.');
    expect(url).toContain('sku.ilike.');
    expect(url).toContain(`limit=${SEARCH_LIMIT}`);
    expect(url).toContain('select=sku,name_es,price_bob,stock,image_url');
  });
});

describe('GET /api/search handler', () => {
  it('returns matching active products in /api/products shape', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    const calls = mockFetch([
      {
        includes: '/rest/v1/products',
        data: [{ sku: 's1', name_es: 'Cacao Fino', price_bob: '45.00', stock: 3, image_url: null }],
      },
    ]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { q: 'cacao' } } as Req, res);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('is_active=eq.true');
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe(200);
    expect(out[0].body).toEqual({
      products: [{ sku: 's1', nameEs: 'Cacao Fino', priceBOB: 45, stock: 3, imageUrl: null }],
    });
  });

  it('returns [] without hitting the DB for empty queries', async () => {
    const calls = mockFetch([]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { q: '   ' } } as Req, res);
    expect(calls).toHaveLength(0);
    expect(out[0]).toEqual({ code: 200, body: { products: [] } });
  });

  it('maps DB failures to a Spanish 500', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    mockFetch([{ includes: '/rest/v1/products', ok: false, status: 500, data: null }]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { q: 'cacao' } } as Req, res);
    expect(out[0]).toEqual({ code: 500, body: { error_es: 'No se pudo buscar en el catálogo' } });
  });

  it('rejects non-GET methods', async () => {
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', query: { q: 'cacao' } } as Req, res);
    expect(out[0]).toEqual({ code: 405, body: { error_es: 'Método no permitido' } });
  });
});
