import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
  buildApprovedReviewsUrl,
  buildOrderItemsCheckUrl,
  buildQueueReviewsUrl,
  buildUserOrdersUrl,
  isAdminEmail,
  isDuplicateReviewError,
  isMissingTableError,
  normalizeReviewComment,
  parseModerationBody,
  parseReviewBody,
  parseReviewRating,
  summarizeApprovedReviews,
  toQueueReviews,
} from '../../api/reviews';

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
const REVIEW_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function stubServiceEnv(): void {
  vi.stubEnv('ADMIN_EMAILS', 'admin@tusitio.bo');
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('isAdminEmail', () => {
  it('matches the allow-list case-insensitively', () => {
    vi.stubEnv('ADMIN_EMAILS', 'Admin@tusitio.bo');
    expect(isAdminEmail('admin@tusitio.bo')).toBe(true);
    expect(isAdminEmail('nadie@ejemplo.bo')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe('parseReviewRating', () => {
  it('accepts integers 1-5', () => {
    for (let n = 1; n <= 5; n += 1) expect(parseReviewRating(n)).toEqual({ ok: true, rating: n });
  });

  it('rejects out-of-range and non-integers in Spanish', () => {
    for (const bad of [0, 6, 3.5, '5', null, undefined, NaN]) {
      expect(parseReviewRating(bad)).toEqual({ ok: false, errorEs: 'Calificación inválida (debe ser de 1 a 5 estrellas)' });
    }
  });
});

describe('normalizeReviewComment', () => {
  it('defaults missing/empty to empty string and trims', () => {
    expect(normalizeReviewComment(undefined)).toEqual({ ok: true, comment: '' });
    expect(normalizeReviewComment('  rico  ')).toEqual({ ok: true, comment: 'rico' });
  });

  it('rejects overlong and non-string comments', () => {
    expect(normalizeReviewComment('x'.repeat(1001))).toEqual({
      ok: false,
      errorEs: 'Comentario demasiado largo (máximo 1000 caracteres)',
    });
    expect(normalizeReviewComment(42)).toEqual({ ok: false, errorEs: 'Comentario inválido' });
  });
});

describe('parseReviewBody', () => {
  const valid = { userId: UUID, sku: 'parati-70-silvestre', rating: 5, comment: 'Excelente' };

  it('accepts a valid review body', () => {
    expect(parseReviewBody(valid)).toEqual({
      ok: true,
      value: { userId: UUID, sku: 'parati-70-silvestre', rating: 5, comment: 'Excelente' },
    });
  });

  it('rejects bad fields in Spanish', () => {
    expect(parseReviewBody({ ...valid, userId: 'no-uuid' })).toEqual({
      ok: false,
      errorEs: 'Sesión no válida, inicia sesión de nuevo',
    });
    expect(parseReviewBody({ ...valid, sku: '  ' })).toEqual({ ok: false, errorEs: 'SKU inválido' });
    expect(parseReviewBody({ ...valid, rating: 0 })).toEqual({
      ok: false,
      errorEs: 'Calificación inválida (debe ser de 1 a 5 estrellas)',
    });
  });
});

describe('parseModerationBody', () => {
  it('accepts approved/rejected with a uuid reviewId', () => {
    expect(parseModerationBody({ reviewId: REVIEW_UUID, status: 'approved' })).toEqual({
      ok: true,
      value: { reviewId: REVIEW_UUID, status: 'approved' },
    });
    expect(parseModerationBody({ reviewId: REVIEW_UUID, status: 'Rejected' })).toEqual({
      ok: true,
      value: { reviewId: REVIEW_UUID, status: 'rejected' },
    });
  });

  it('rejects bad ids and statuses in Spanish', () => {
    expect(parseModerationBody({ reviewId: 'x', status: 'approved' })).toEqual({ ok: false, errorEs: 'Opinión inválida' });
    expect(parseModerationBody({ reviewId: REVIEW_UUID, status: 'pending' })).toEqual({
      ok: false,
      errorEs: 'Estado inválido (solo aprobada o rechazada)',
    });
  });
});

describe('summarizeApprovedReviews', () => {
  it('computes the average to 1 decimal and filters invalid rows', () => {
    const rows = [
      { id: 'a', rating: 5, comment: 'Top', created_at: '2026-01-01' },
      { id: 'b', rating: 4, comment: '', created_at: '' },
      { id: '', rating: 5 },
      { id: 'c', rating: 9 },
    ];
    expect(summarizeApprovedReviews(rows)).toEqual({
      reviews: [
        { id: 'a', rating: 5, comment: 'Top', createdAt: '2026-01-01' },
        { id: 'b', rating: 4, comment: '', createdAt: '' },
      ],
      average: 4.5,
      count: 2,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(summarizeApprovedReviews([])).toEqual({ reviews: [], average: 0, count: 0 });
    expect(summarizeApprovedReviews(null)).toEqual({ reviews: [], average: 0, count: 0 });
  });
});

describe('toQueueReviews', () => {
  it('shapes queue rows and drops incomplete ones', () => {
    const rows = [
      { id: 'a', product_sku: 'sku-1', user_id: UUID, rating: 5, comment: 'c', status: 'pending', created_at: '' },
      { id: 'b', product_sku: '', user_id: UUID, rating: 5, status: 'pending' },
    ];
    expect(toQueueReviews(rows)).toEqual([
      { id: 'a', sku: 'sku-1', userId: UUID, rating: 5, comment: 'c', status: 'pending', createdAt: '' },
    ]);
  });
});

describe('URL builders', () => {
  const base = 'https://x.supabase.co';

  it('builds approved, queue, and purchase-check URLs', () => {
    expect(buildApprovedReviewsUrl(base, 'sku-1')).toContain('product_sku=eq.sku-1');
    expect(buildApprovedReviewsUrl(base, 'sku-1')).toContain('status=eq.approved');
    expect(buildQueueReviewsUrl(base, 'pending')).toContain('status=eq.pending');
    expect(buildQueueReviewsUrl(base, 'pending', 'sku-1')).toContain('product_sku=eq.sku-1');
    expect(buildUserOrdersUrl(base, UUID)).toContain(`user_id=eq.${UUID}`);
    expect(buildOrderItemsCheckUrl(base, ['o1'], 'sku-1')).toContain('sku=eq.sku-1');
  });
});

describe('table/error classifiers', () => {
  it('detects missing-table and duplicate errors', () => {
    expect(isMissingTableError(404, { code: 'PGRST205', message: 'x' })).toBe(true);
    expect(isMissingTableError(500, { code: '42P01' })).toBe(true);
    expect(isMissingTableError(500, { message: 'ok' })).toBe(false);
    expect(isDuplicateReviewError(409, { code: '23505' })).toBe(true);
    expect(isDuplicateReviewError(409, { message: 'duplicate key value violates unique constraint' })).toBe(true);
    expect(isDuplicateReviewError(500, { code: '23505' })).toBe(false);
  });
});

describe('GET /api/reviews?sku= (public approved)', () => {
  it('returns approved reviews + average', async () => {
    stubServiceEnv();
    mockFetch([
      {
        includes: '/rest/v1/reviews',
        data: [{ id: 'a', rating: 5, comment: 'Top', created_at: '2026-01-01' }],
      },
    ]);
    const { res, calls } = makeRes();
    await handler({ method: 'GET', query: { sku: 'sku-1' } } as Req, res);
    expect(calls[0]?.code).toBe(200);
    expect(calls[0]?.body).toMatchObject({ average: 5, count: 1 });
  });

  it('rejects a missing sku and maps a missing table to 503', async () => {
    stubServiceEnv();
    const first = makeRes();
    await handler({ method: 'GET', query: {} } as Req, first.res);
    expect(first.calls[0]).toEqual({ code: 400, body: { error_es: 'SKU inválido' } });

    mockFetch([{ includes: '/rest/v1/reviews', ok: false, status: 404, data: { code: 'PGRST205' } }]);
    const second = makeRes();
    await handler({ method: 'GET', query: { sku: 'sku-1' } } as Req, second.res);
    expect(second.calls[0]).toEqual({ code: 503, body: { error_es: 'Las opiniones no están disponibles todavía' } });
  });
});

describe('GET /api/reviews?status=pending (admin queue)', () => {
  it('denies non-admins and serves the queue to admins', async () => {
    stubServiceEnv();
    const denied = makeRes();
    await handler({ method: 'GET', query: { status: 'pending', adminEmail: 'nadie@ejemplo.bo' } } as Req, denied.res);
    expect(denied.calls[0]).toEqual({ code: 403, body: { error_es: 'No autorizado: solo administración' } });

    mockFetch([
      {
        includes: '/rest/v1/reviews',
        data: [{ id: 'a', product_sku: 'sku-1', user_id: UUID, rating: 4, comment: '', status: 'pending', created_at: '' }],
      },
    ]);
    const { res, calls } = makeRes();
    await handler({ method: 'GET', query: { status: 'pending', adminEmail: 'admin@tusitio.bo' } } as Req, res);
    expect(calls[0]?.code).toBe(200);
    expect(calls[0]?.body).toMatchObject({ reviews: [{ id: 'a', sku: 'sku-1' }] });
  });
});

describe('POST /api/reviews (verified purchase)', () => {
  const body = { userId: UUID, sku: 'sku-1', rating: 5, comment: 'Muy bueno' };

  function purchaseRoutes(itemsData: unknown): Route[] {
    return [
      { includes: '/auth/v1/admin/users/', data: { email: 'u@ejemplo.bo' } },
      { includes: '/rest/v1/products', data: [{ sku: 'sku-1' }] },
      { includes: '/rest/v1/orders', data: [{ id: 'order-1' }] },
      { includes: '/rest/v1/order_items', data: itemsData },
      { includes: '/rest/v1/reviews', method: 'POST', status: 201, data: [{ id: 'rev-1' }] },
    ];
  }

  it('creates a pending review (201) after a verified purchase', async () => {
    stubServiceEnv();
    mockFetch(purchaseRoutes([{ order_id: 'order-1' }]));
    const { res, calls } = makeRes();
    await handler({ method: 'POST', body } as Req, res);
    expect(calls[0]).toEqual({ code: 201, body: { id: 'rev-1', status: 'pending' } });
  });

  it('rejects without purchase (403) and without session (401)', async () => {
    stubServiceEnv();
    mockFetch(purchaseRoutes([]));
    const { res, calls } = makeRes();
    await handler({ method: 'POST', body } as Req, res);
    expect(calls[0]).toEqual({ code: 403, body: { error_es: 'Solo quienes compraron pueden opinar' } });

    mockFetch([{ includes: '/auth/v1/admin/users/', ok: false, status: 401, data: null }]);
    const second = makeRes();
    await handler({ method: 'POST', body } as Req, second.res);
    expect(second.calls[0]).toEqual({ code: 401, body: { error_es: 'Sesión no válida, inicia sesión de nuevo' } });
  });

  it('maps duplicate reviews to a Spanish 400', async () => {
    stubServiceEnv();
    mockFetch([
      { includes: '/auth/v1/admin/users/', data: { email: 'u@ejemplo.bo' } },
      { includes: '/rest/v1/products', data: [{ sku: 'sku-1' }] },
      { includes: '/rest/v1/orders', data: [{ id: 'order-1' }] },
      { includes: '/rest/v1/order_items', data: [{ order_id: 'order-1' }] },
      {
        includes: '/rest/v1/reviews',
        method: 'POST',
        ok: false,
        status: 409,
        data: { code: '23505', message: 'duplicate key value violates unique constraint' },
      },
    ]);
    const { res, calls } = makeRes();
    await handler({ method: 'POST', body } as Req, res);
    expect(calls[0]).toEqual({ code: 400, body: { error_es: 'Ya opinaste sobre este producto' } });
  });
});

describe('PATCH /api/reviews (moderation)', () => {
  it('approves as admin and denies non-admins', async () => {
    stubServiceEnv();
    mockFetch([{ includes: '/rest/v1/reviews', method: 'PATCH', data: [{ id: REVIEW_UUID, status: 'approved' }] }]);
    const { res, calls } = makeRes();
    await handler(
      { method: 'PATCH', body: { adminEmail: 'admin@tusitio.bo', reviewId: REVIEW_UUID, status: 'approved' } } as Req,
      res,
    );
    expect(calls[0]).toEqual({ code: 200, body: { id: REVIEW_UUID, status: 'approved' } });

    const denied = makeRes();
    await handler(
      { method: 'PATCH', body: { adminEmail: 'nadie@ejemplo.bo', reviewId: REVIEW_UUID, status: 'approved' } } as Req,
      denied.res,
    );
    expect(denied.calls[0]).toEqual({ code: 403, body: { error_es: 'No autorizado: solo administración' } });
  });

  it('maps unknown reviews to 404 and bad statuses to 400', async () => {
    stubServiceEnv();
    mockFetch([{ includes: '/rest/v1/reviews', method: 'PATCH', data: [] }]);
    const { res, calls } = makeRes();
    await handler(
      { method: 'PATCH', body: { adminEmail: 'admin@tusitio.bo', reviewId: REVIEW_UUID, status: 'rejected' } } as Req,
      res,
    );
    expect(calls[0]).toEqual({ code: 404, body: { error_es: 'Opinión no encontrada' } });

    const bad = makeRes();
    await handler(
      { method: 'PATCH', body: { adminEmail: 'admin@tusitio.bo', reviewId: REVIEW_UUID, status: 'pending' } } as Req,
      bad.res,
    );
    expect(bad.calls[0]).toEqual({ code: 400, body: { error_es: 'Estado inválido (solo aprobada o rechazada)' } });
  });
});
