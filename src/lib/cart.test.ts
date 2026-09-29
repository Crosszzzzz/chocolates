import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
  buildCartLookupUrl,
  buildProductsStockUrl,
  CARTS_TABLE_MISSING,
  clampCartLines,
  isMissingTableError,
  MAX_CART_LINES,
  mergeCarts,
  parseCartLines,
  parseCartUserId,
  readQueryUserId,
} from '../../api/cart';
import { addLineToCart } from './cart';

type Req = Parameters<typeof handler>[0];
type Res = Parameters<typeof handler>[1];

const UID = '123e4567-e89b-12d3-a456-426614174000';

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

function stubServiceEnv(): void {
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('parseCartUserId', () => {
  it('accepts a trimmed uuid', () => {
    expect(parseCartUserId(`  ${UID} `)).toEqual({ ok: true, userId: UID });
  });

  it('rejects missing or malformed ids in Spanish', () => {
    expect(parseCartUserId(undefined)).toEqual({ ok: false, errorEs: 'Sesión no válida, inicia sesión de nuevo' });
    expect(parseCartUserId('not-a-uuid')).toEqual({ ok: false, errorEs: 'Sesión no válida, inicia sesión de nuevo' });
  });
});

describe('readQueryUserId', () => {
  it('reads userId (or user_id alias), first value wins', () => {
    expect(readQueryUserId({ userId: UID })).toBe(UID);
    expect(readQueryUserId({ user_id: UID })).toBe(UID);
    expect(readQueryUserId({ userId: ['a', 'b'] })).toBe('a');
    expect(readQueryUserId(undefined)).toBe(undefined);
  });
});

describe('parseCartLines', () => {
  it('accepts valid lines and merges duplicate SKUs by summing', () => {
    expect(parseCartLines([{ sku: ' a ', qty: 1 }, { sku: 'a', qty: 2 }, { sku: 'b', qty: 3 }])).toEqual({
      ok: true,
      lines: [
        { sku: 'a', qty: 3 },
        { sku: 'b', qty: 3 },
      ],
    });
  });

  it('accepts an empty array (clear)', () => {
    expect(parseCartLines([])).toEqual({ ok: true, lines: [] });
  });

  it('rejects non-arrays, bad SKUs, and bad qty in Spanish', () => {
    expect(parseCartLines(null)).toEqual({ ok: false, errorEs: 'Carrito inválido' });
    expect(parseCartLines([{ sku: '  ', qty: 1 }])).toEqual({ ok: false, errorEs: 'Carrito inválido' });
    expect(parseCartLines([{ sku: 'a', qty: 0 }])).toEqual({ ok: false, errorEs: 'Cantidad inválida para SKU a' });
    expect(parseCartLines([{ sku: 'a', qty: 1.5 }])).toEqual({ ok: false, errorEs: 'Cantidad inválida para SKU a' });
  });

  it('rejects carts over the line cap', () => {
    const lines = Array.from({ length: MAX_CART_LINES + 1 }, (_, i) => ({ sku: `s${i}`, qty: 1 }));
    expect(parseCartLines(lines)).toEqual({ ok: false, errorEs: 'El carrito tiene demasiados productos' });
  });
});

describe('mergeCarts (server wins)', () => {
  it('takes the server qty on conflict and keeps local-only lines', () => {
    expect(
      mergeCarts(
        [{ sku: 'a', qty: 5 }],
        [
          { sku: 'a', qty: 1 },
          { sku: 'b', qty: 2 },
        ],
      ),
    ).toEqual([
      { sku: 'a', qty: 5 },
      { sku: 'b', qty: 2 },
    ]);
  });

  it('drops non-positive lines and keeps server order first', () => {
    expect(mergeCarts([{ sku: 'a', qty: 0 }], [{ sku: 'b', qty: 0 }])).toEqual([]);
  });
});

describe('addLineToCart (add-to-cart button flow)', () => {
  it('adds a new SKU with qty 1 when stock is available', () => {
    expect(addLineToCart([], 'a', 5)).toEqual({ lines: [{ sku: 'a', qty: 1 }], warning: null });
  });

  it('increments an existing SKU while under stock', () => {
    expect(addLineToCart([{ sku: 'a', qty: 1 }], 'a', 5)).toEqual({ lines: [{ sku: 'a', qty: 2 }], warning: null });
  });

  it('refuses out-of-stock adds (the button is disabled client-side too)', () => {
    expect(addLineToCart([], 'a', 0)).toEqual({ lines: [], warning: 'Sin stock' });
  });

  it('clamps at the stock cap with a Spanish warning', () => {
    expect(addLineToCart([{ sku: 'a', qty: 2 }], 'a', 2)).toEqual({
      lines: [{ sku: 'a', qty: 2 }],
      warning: 'Solo quedan 2 unidades',
    });
  });
});

describe('clampCartLines', () => {
  const products = [
    { sku: 'a', stock: 2, is_active: true },
    { sku: 'off', stock: 9, is_active: false },
    { sku: 'empty', stock: 0, is_active: true },
  ];

  it('keeps in-stock lines untouched', () => {
    expect(clampCartLines([{ sku: 'a', qty: 2 }], products)).toEqual({ lines: [{ sku: 'a', qty: 2 }], warnings: [] });
  });

  it('clamps over-stock qty with a Spanish warning', () => {
    const result = clampCartLines([{ sku: 'a', qty: 9 }], products);
    expect(result.lines).toEqual([{ sku: 'a', qty: 2 }]);
    expect(result.warnings).toEqual(['Solo quedan 2 unidades de a']);
  });

  it('drops unknown, inactive, and zero-stock SKUs with warnings', () => {
    const result = clampCartLines(
      [
        { sku: 'ghost', qty: 1 },
        { sku: 'off', qty: 1 },
        { sku: 'empty', qty: 1 },
      ],
      products,
    );
    expect(result.lines).toEqual([]);
    expect(result.warnings).toEqual([
      'Producto no encontrado: ghost',
      'Producto no disponible: off',
      'Sin stock de empty',
    ]);
  });
});

describe('isMissingTableError', () => {
  it('detects PostgREST schema-cache misses and unknown relations', () => {
    expect(isMissingTableError(404, { code: 'PGRST205', message: "Could not find the table 'public.carts'" })).toBe(true);
    expect(isMissingTableError(404, { message: "Could not find the table 'public.cart_items' in the schema cache" })).toBe(
      true,
    );
    expect(isMissingTableError(500, { code: '42P01', message: 'relation "public.carts" does not exist' })).toBe(true);
  });

  it('ignores unrelated failures', () => {
    expect(isMissingTableError(500, { message: 'boom' })).toBe(false);
    expect(isMissingTableError(500, null)).toBe(false);
  });
});

describe('endpoint builders', () => {
  it('looks up the cart by user_id and checks 001-only product columns', () => {
    expect(buildCartLookupUrl('https://x.supabase.co', UID)).toContain('/rest/v1/carts?select=id&user_id=eq.');
    const url = buildProductsStockUrl('https://x.supabase.co', ['a', 'b']);
    expect(url).toContain('select=sku,stock,is_active');
    expect(url).toContain('sku=in.(');
    expect(url).not.toContain('company_id');
    expect(url).not.toContain('role');
  });
});

describe('/api/cart handler (mocked fetch, no live DB)', () => {
  it('rejects unsupported methods', async () => {
    const { res, calls } = makeRes();
    await handler({ method: 'PATCH', query: { userId: UID } } as Req, res);
    expect(calls).toEqual([{ code: 405, body: { error_es: 'Método no permitido' } }]);
  });

  it('returns 401 without touching the DB for a bad session', async () => {
    const calls = mockFetch([]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { userId: 'nope' } } as Req, res);
    expect(calls).toHaveLength(0);
    expect(out).toEqual([{ code: 401, body: { error_es: 'Sesión no válida, inicia sesión de nuevo' } }]);
  });

  it('returns 500 when service env is missing', async () => {
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { userId: UID } } as Req, res);
    expect(out).toEqual([{ code: 500, body: { error_es: 'No se pudo cargar el carrito' } }]);
  });

  it('GET returns lines for an existing cart', async () => {
    stubServiceEnv();
    mockFetch([
      { includes: '/auth/v1/admin/users', data: { email: 'a@b.bo' } },
      { includes: 'carts?select=id', data: [{ id: 'cart-1' }] },
      { includes: 'cart_items?select', data: [{ sku: 'a', qty: 2 }] },
    ]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { userId: UID } } as Req, res);
    expect(out).toEqual([{ code: 200, body: { lines: [{ sku: 'a', qty: 2 }] } }]);
  });

  it('GET returns [] when the user has no cart row yet', async () => {
    stubServiceEnv();
    const calls = mockFetch([
      { includes: '/auth/v1/admin/users', data: { email: 'a@b.bo' } },
      { includes: 'carts?select=id', data: [] },
    ]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { userId: UID } } as Req, res);
    expect(calls).toHaveLength(2);
    expect(out).toEqual([{ code: 200, body: { lines: [] } }]);
  });

  it('GET answers 503 with a machine code when 004 is not applied', async () => {
    stubServiceEnv();
    mockFetch([
      { includes: '/auth/v1/admin/users', data: { email: 'a@b.bo' } },
      {
        includes: 'carts?select=id',
        ok: false,
        status: 404,
        data: { code: 'PGRST205', message: "Could not find the table 'public.carts' in the schema cache" },
      },
    ]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET', query: { userId: UID } } as Req, res);
    expect(out).toEqual([
      { code: 503, body: { error_es: 'Carrito del servidor no disponible todavía', code: CARTS_TABLE_MISSING } },
    ]);
  });

  it('PUT replaces the cart, clamping with warnings', async () => {
    stubServiceEnv();
    mockFetch([
      { includes: '/auth/v1/admin/users', data: { email: 'a@b.bo' } },
      {
        includes: '/rest/v1/products',
        data: [{ sku: 'a', stock: 2, is_active: true }],
      },
      { includes: 'carts?select=id', data: [{ id: 'cart-1' }] },
      { includes: '/rest/v1/cart_items', data: null },
    ]);
    const { res, calls: out } = makeRes();
    await handler(
      { method: 'PUT', body: { userId: UID, lines: [{ sku: 'a', qty: 9 }, { sku: 'ghost', qty: 1 }] } } as Req,
      res,
    );
    expect(out).toEqual([
      {
        code: 200,
        body: {
          lines: [{ sku: 'a', qty: 2 }],
          warnings: ['Solo quedan 2 unidades de a', 'Producto no encontrado: ghost'],
        },
      },
    ]);
  });

  it('PUT rejects malformed lines with a Spanish 400', async () => {
    stubServiceEnv();
    mockFetch([{ includes: '/auth/v1/admin/users', data: { email: 'a@b.bo' } }]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'PUT', body: { userId: UID, lines: [{ sku: 'a', qty: 0 }] } } as Req, res);
    expect(out).toEqual([{ code: 400, body: { error_es: 'Cantidad inválida para SKU a' } }]);
  });

  it('DELETE clears the cart (cascade wipes items)', async () => {
    stubServiceEnv();
    const calls = mockFetch([
      { includes: '/auth/v1/admin/users', data: { email: 'a@b.bo' } },
      { includes: '/rest/v1/carts?user_id', data: null },
    ]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'DELETE', query: { userId: UID } } as Req, res);
    expect(calls.some((c) => c.init !== null && (c.init as { method?: string }).method === 'DELETE')).toBe(true);
    expect(out).toEqual([{ code: 200, body: { lines: [] } }]);
  });
});
