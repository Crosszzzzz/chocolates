import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
  attachItemCounts,
  computeKpis,
  computeTopProducts,
  isAdminEmail,
  readStatsCredentials,
  toStatsNumber,
} from '../../api/admin-stats';

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

type Route = { includes: string; method?: string; ok?: boolean; status?: number; data?: unknown };
function mockFetch(routes: Route[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init: unknown) => {
      const u = String(url);
      const m = (init as { method?: string } | undefined)?.method;
      const route = routes.find((r) => u.includes(r.includes) && (r.method === undefined || r.method === m));
      if (!route) throw new Error(`unexpected fetch: ${m ?? 'GET'} ${u}`);
      return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.data ?? null };
    }),
  );
}

const UUID = '123e4567-e89b-12d3-a456-426614174000';

function stubServiceEnv(): void {
  vi.stubEnv('ADMIN_EMAILS', 'admin@tusitio.bo');
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('toStatsNumber', () => {
  it('parses numbers and numeric strings, garbage => 0', () => {
    expect(toStatsNumber(45)).toBe(45);
    expect(toStatsNumber('45.00')).toBe(45);
    expect(toStatsNumber(' 12.5 ')).toBe(12.5);
    expect(toStatsNumber(null)).toBe(0);
    expect(toStatsNumber(undefined)).toBe(0);
    expect(toStatsNumber('nope')).toBe(0);
    expect(toStatsNumber('')).toBe(0);
  });
});

describe('isAdminEmail', () => {
  it('matches the allow-list case-insensitively', () => {
    vi.stubEnv('ADMIN_EMAILS', 'Admin@tusitio.bo, otro@ejemplo.bo');
    expect(isAdminEmail('admin@tusitio.bo')).toBe(true);
    expect(isAdminEmail(' OTRO@ejemplo.bo ')).toBe(true);
    expect(isAdminEmail('nadie@ejemplo.bo')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe('readStatsCredentials', () => {
  it('prefers the POST body, falls back to GET query with snake_case aliases', () => {
    expect(readStatsCredentials({ method: 'POST', body: { adminEmail: 'a@x.bo' } } as Req)).toEqual({
      adminEmail: 'a@x.bo',
      userId: undefined,
    });
    expect(
      readStatsCredentials({ method: 'GET', query: { admin_email: 'q@x.bo', user_id: UUID } } as unknown as Req),
    ).toEqual({ adminEmail: 'q@x.bo', userId: UUID });
    expect(readStatsCredentials({ method: 'GET', query: { userId: [UUID] } } as unknown as Req)).toEqual({
      adminEmail: undefined,
      userId: UUID,
    });
  });
});

describe('computeKpis', () => {
  const products = [
    { sku: 'a', name_es: 'A', stock: 0, is_active: true },
    { sku: 'b', name_es: 'B', stock: 3, is_active: true },
    { sku: 'c', name_es: 'C', stock: 30, is_active: true },
    { sku: 'd', name_es: 'D', stock: 1, is_active: false },
  ];
  const orders = [
    { id: 'o1', total_bob: '45.00', status: 'reserved' },
    { id: 'o2', total_bob: 10, status: 'cancelled' },
  ];

  it('counts actives, excludes cancelled revenue, flags low stock sorted asc', () => {
    expect(computeKpis(products, orders)).toEqual({
      totalOrders: 2,
      revenueBOB: 45,
      activeProducts: 3,
      outOfStock: 1,
      lowStock: [
        { sku: 'a', nameEs: 'A', stock: 0 },
        { sku: 'b', nameEs: 'B', stock: 3 },
      ],
    });
  });

  it('handles empty inputs', () => {
    expect(computeKpis([], [])).toEqual({
      totalOrders: 0,
      revenueBOB: 0,
      activeProducts: 0,
      outOfStock: 0,
      lowStock: [],
    });
  });
});

describe('attachItemCounts', () => {
  it('sums unit quantities per order, missing items => 0', () => {
    const orders = [
      { id: 'o1', total_bob: '45.00', fulfillment: 'pickup', status: 'reserved', created_at: '2026-01-01T00:00:00Z' },
      { id: 'o2', total_bob: 10, fulfillment: 'delivery-sucre', status: 'reserved', created_at: '2026-01-02T00:00:00Z' },
    ];
    const items = [
      { order_id: 'o1', sku: 'a', qty: 2 },
      { order_id: 'o1', sku: 'b', qty: 1 },
      { order_id: 'nope', sku: '', qty: 9 },
    ];
    expect(attachItemCounts(orders, items)).toEqual([
      { id: 'o1', total_bob: 45, fulfillment: 'pickup', status: 'reserved', created_at: '2026-01-01T00:00:00Z', itemCount: 3 },
      { id: 'o2', total_bob: 10, fulfillment: 'delivery-sucre', status: 'reserved', created_at: '2026-01-02T00:00:00Z', itemCount: 0 },
    ]);
  });
});

describe('computeTopProducts', () => {
  it('aggregates qty desc with sku tie-break and limit', () => {
    const items = [
      { order_id: 'o1', sku: 'b', qty: 1 },
      { order_id: 'o1', sku: 'a', qty: 2 },
      { order_id: 'o2', sku: 'a', qty: 5 },
      { order_id: 'o2', sku: '', qty: 9 },
    ];
    expect(computeTopProducts(items)).toEqual([
      { sku: 'a', qty: 7 },
      { sku: 'b', qty: 1 },
    ]);
    expect(computeTopProducts(items, 1)).toEqual([{ sku: 'a', qty: 7 }]);
  });
});

describe('GET /api/admin-stats handler (mocked fetch)', () => {
  const products = [
    { sku: 'a', name_es: 'A', stock: 0, is_active: true },
    { sku: 'b', name_es: 'B', stock: 3, is_active: true },
    { sku: 'c', name_es: 'C', stock: 30, is_active: true },
  ];
  const ordersAll = [
    { id: 'o1', total_bob: '45.00', status: 'reserved' },
    { id: 'o2', total_bob: 10, status: 'cancelled' },
  ];
  const ordersRecent = [
    { id: 'o1', total_bob: '45.00', fulfillment: 'pickup', status: 'reserved', created_at: '2026-01-01T00:00:00Z' },
  ];
  const items = [
    { order_id: 'o1', sku: 'a', qty: 2 },
    { order_id: 'o1', sku: 'b', qty: 1 },
    { order_id: 'o2', sku: 'a', qty: 5 },
  ];
  function stubDashboard(): void {
    mockFetch([
      { includes: '/rest/v1/products', data: products },
      { includes: 'select=id,total_bob,status', data: ordersAll },
      { includes: 'order=created_at.desc', data: ordersRecent },
      { includes: '/rest/v1/order_items', data: items },
    ]);
  }

  it('returns the dashboard payload for allow-list email', async () => {
    stubServiceEnv();
    stubDashboard();
    const { res, calls } = makeRes();
    await handler({ method: 'GET', query: { adminEmail: 'ADMIN@tusitio.bo' } } as unknown as Req, res);
    expect(calls[0]?.code).toBe(200);
    expect(calls[0]?.body).toEqual({
      kpis: {
        totalOrders: 2,
        revenueBOB: 45,
        activeProducts: 3,
        outOfStock: 1,
        lowStock: [
          { sku: 'a', nameEs: 'A', stock: 0 },
          { sku: 'b', nameEs: 'B', stock: 3 },
        ],
      },
      recentOrders: [
        {
          id: 'o1',
          total_bob: 45,
          fulfillment: 'pickup',
          status: 'reserved',
          created_at: '2026-01-01T00:00:00Z',
          itemCount: 3,
        },
      ],
      topProducts: [
        { sku: 'a', qty: 7 },
        { sku: 'b', qty: 1 },
      ],
    });
  });

  it('authorizes via role admin userId and denies empresa role', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'otro@tusitio.bo');
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    mockFetch([
      { includes: '/auth/v1/admin/users/', data: { email: 'a@ejemplo.bo' } },
      { includes: '/rest/v1/profiles', data: [{ role: 'admin' }] },
      { includes: '/rest/v1/products', data: products },
      { includes: 'select=id,total_bob,status', data: ordersAll },
      { includes: 'order=created_at.desc', data: ordersRecent },
      { includes: '/rest/v1/order_items', data: items },
    ]);
    const { res, calls } = makeRes();
    await handler({ method: 'POST', body: { userId: UUID } } as Req, res);
    expect(calls[0]?.code).toBe(200);

    mockFetch([
      { includes: '/auth/v1/admin/users/', data: { email: 'e@ejemplo.bo' } },
      { includes: '/rest/v1/profiles', data: [{ role: 'empresa' }] },
    ]);
    const second = makeRes();
    await handler({ method: 'POST', body: { userId: UUID } } as Req, second.res);
    expect(second.calls[0]).toEqual({ code: 403, body: { error_es: 'No autorizado: solo administración' } });
  });

  it('denies non-admins, rejects bad methods, maps DB failures to Spanish 500', async () => {
    stubServiceEnv();
    const { res, calls } = makeRes();
    await handler({ method: 'GET', query: { adminEmail: 'nadie@ejemplo.bo' } } as unknown as Req, res);
    expect(calls[0]).toEqual({ code: 403, body: { error_es: 'No autorizado: solo administración' } });

    const badMethod = makeRes();
    await handler({ method: 'PUT', query: { adminEmail: 'admin@tusitio.bo' } } as unknown as Req, badMethod.res);
    expect(badMethod.calls[0]).toEqual({ code: 405, body: { error_es: 'Método no permitido' } });

    mockFetch([{ includes: '/rest/v1/products', ok: false, status: 500, data: null }]);
    const dbFail = makeRes();
    await handler({ method: 'GET', query: { adminEmail: 'admin@tusitio.bo' } } as unknown as Req, dbFail.res);
    expect(dbFail.calls[0]).toEqual({ code: 500, body: { error_es: 'No se pudo cargar el panel' } });
  });
});
