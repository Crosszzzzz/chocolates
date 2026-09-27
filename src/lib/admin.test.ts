import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
  isAdminEmail,
  parseAdminAction,
  validateCreateProduct,
  validateDeleteProduct,
} from '../../api/admin';

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
function mockFetch(routes: Route[]): { url: string; init: unknown }[] {
  const calls: { url: string; init: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init: unknown) => {
      const u = String(url);
      const m = (init as { method?: string } | undefined)?.method;
      calls.push({ url: u, init });
      const route = routes.find((r) => u.includes(r.includes) && (r.method === undefined || r.method === m));
      if (!route) throw new Error(`unexpected fetch: ${m ?? 'GET'} ${u}`);
      return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.data ?? null };
    }),
  );
  return calls;
}

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const COMPANY_UUID = '11111111-2222-3333-4444-555555555555';

function stubServiceEnv(): void {
  vi.stubEnv('ADMIN_EMAILS', 'admin@tusitio.bo');
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
}

function patchBody(call: { init: unknown }): unknown {
  return JSON.parse(String((call.init as { body?: string })?.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

describe('parseAdminAction', () => {
  it('defaults missing action to legacy update', () => {
    expect(parseAdminAction(undefined)).toBe('update');
    expect(parseAdminAction(null)).toBe('update');
    expect(parseAdminAction('')).toBe('update');
    expect(parseAdminAction('create')).toBe('create');
    expect(parseAdminAction('delete')).toBe('delete');
  });

  it('rejects unknown actions', () => {
    expect(parseAdminAction('drop')).toBe(null);
    expect(parseAdminAction(42)).toBe(null);
  });
});

describe('validateCreateProduct', () => {
  const valid = { sku: 'nuevo-1', name_es: 'Nuevo Chocolate', price_bob: 20, stock: 3 };

  it('accepts snake_case and camelCase spellings, optional company', () => {
    expect(validateCreateProduct(valid)).toEqual({
      ok: true,
      value: { sku: 'nuevo-1', nameEs: 'Nuevo Chocolate', priceBOB: 20, stock: 3, companyId: null },
    });
    expect(
      validateCreateProduct({ sku: 'n', nameEs: 'N', priceBOB: 5, stock: 0, companyId: COMPANY_UUID }),
    ).toEqual({ ok: true, value: { sku: 'n', nameEs: 'N', priceBOB: 5, stock: 0, companyId: COMPANY_UUID } });
  });

  it('rejects bad fields in Spanish', () => {
    expect(validateCreateProduct({ ...valid, sku: '' }).ok).toBe(false);
    expect(validateCreateProduct({ ...valid, name_es: '  ' })).toEqual({ ok: false, errorEs: 'Nombre inválido' });
    expect(validateCreateProduct({ ...valid, price_bob: -1 })).toEqual({
      ok: false,
      errorEs: 'Precio inválido (debe ser mayor a 0)',
    });
    expect(validateCreateProduct({ ...valid, stock: 1.5 })).toEqual({
      ok: false,
      errorEs: 'Stock inválido (debe ser 0 o mayor)',
    });
    expect(validateCreateProduct({ ...valid, company_id: 'not-a-uuid' })).toEqual({
      ok: false,
      errorEs: 'Empresa inválida',
    });
  });
});

describe('validateDeleteProduct', () => {
  it('requires a non-empty sku', () => {
    expect(validateDeleteProduct({ sku: ' x ' })).toEqual({ ok: true, sku: 'x' });
    expect(validateDeleteProduct({})).toEqual({ ok: false, errorEs: 'SKU inválido' });
  });
});

describe('POST /api/admin legacy update (backward compat)', () => {
  it('keeps the PR5 contract: 200 { sku, priceBOB, stock }', async () => {
    stubServiceEnv();
    const calls = mockFetch([{ includes: '/rest/v1/products', method: 'PATCH', data: [{ price_bob: 10, stock: 5 }] }]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { adminEmail: 'ADMIN@tusitio.bo', sku: 'x', priceBOB: 10, stock: 5 } } as Req, res);
    expect((calls[0].init as { method?: string }).method).toBe('PATCH');
    expect(out[0]).toEqual({ code: 200, body: { sku: 'x', priceBOB: 10, stock: 5 } });
  });

  it('still denies non-admins and keeps legacy validation messages', async () => {
    stubServiceEnv();
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { adminEmail: 'nadie@ejemplo.bo', sku: 'x', stock: 1 } } as Req, res);
    expect(out[0]).toEqual({ code: 403, body: { error_es: 'No autorizado: solo administración' } });

    const second = makeRes();
    await handler({ method: 'POST', body: { adminEmail: 'admin@tusitio.bo', sku: 'x' } } as Req, second.res);
    expect(second.calls[0]).toEqual({ code: 400, body: { error_es: 'Nada para actualizar' } });
  });
});

describe('POST /api/admin create', () => {
  it('creates via allow-list email with 201', async () => {
    stubServiceEnv();
    const calls = mockFetch([
      { includes: '/rest/v1/products', method: 'POST', status: 201, data: [{ name_es: 'Nuevo', price_bob: 20, stock: 3 }] },
    ]);
    const { res, calls: out } = makeRes();
    await handler(
      { method: 'POST', body: { action: 'create', adminEmail: 'admin@tusitio.bo', sku: 'nuevo-1', name_es: 'Nuevo', price_bob: 20, stock: 3 } } as Req,
      res,
    );
    expect(patchBody(calls[0])).toMatchObject({ sku: 'nuevo-1', name_es: 'Nuevo', is_active: true });
    expect(out[0]).toEqual({ code: 201, body: { sku: 'nuevo-1', nameEs: 'Nuevo', priceBOB: 20, stock: 3 } });
  });

  it('attaches company_id after verifying the company exists', async () => {
    stubServiceEnv();
    const calls = mockFetch([
      { includes: '/rest/v1/companies', data: [{ id: COMPANY_UUID }] },
      { includes: '/rest/v1/products', method: 'POST', status: 201, data: [{ name_es: 'N', price_bob: 5, stock: 0 }] },
    ]);
    const { res, calls: out } = makeRes();
    await handler(
      {
        method: 'POST',
        body: { action: 'create', adminEmail: 'admin@tusitio.bo', sku: 'n', name_es: 'N', price_bob: 5, stock: 0, company_id: COMPANY_UUID },
      } as Req,
      res,
    );
    expect(patchBody(calls[1])).toMatchObject({ company_id: COMPANY_UUID });
    expect(out[0].code).toBe(201);
  });

  it('creates via role admin userId and denies empresa role', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'otro@tusitio.bo');
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    mockFetch([
      { includes: '/auth/v1/admin/users/', data: { email: 'a@ejemplo.bo' } },
      { includes: '/rest/v1/profiles', data: [{ role: 'admin' }] },
      { includes: '/rest/v1/products', method: 'POST', status: 201, data: [{ name_es: 'N', price_bob: 5, stock: 1 }] },
    ]);
    const { res, calls: out } = makeRes();
    await handler(
      { method: 'POST', body: { action: 'create', userId: UUID, sku: 'n', name_es: 'N', price_bob: 5, stock: 1 } } as Req,
      res,
    );
    expect(out[0].code).toBe(201);

    mockFetch([
      { includes: '/auth/v1/admin/users/', data: { email: 'e@ejemplo.bo' } },
      { includes: '/rest/v1/profiles', data: [{ role: 'empresa' }] },
    ]);
    const second = makeRes();
    await handler(
      { method: 'POST', body: { action: 'create', userId: UUID, sku: 'n', name_es: 'N', price_bob: 5, stock: 1 } } as Req,
      second.res,
    );
    expect(second.calls[0]).toEqual({ code: 403, body: { error_es: 'No autorizado: solo administración' } });
  });

  it('maps duplicate SKU to a Spanish 400', async () => {
    stubServiceEnv();
    mockFetch([{ includes: '/rest/v1/products', method: 'POST', ok: false, status: 409, data: null }]);
    const { res, calls: out } = makeRes();
    await handler(
      { method: 'POST', body: { action: 'create', adminEmail: 'admin@tusitio.bo', sku: 'dup', name_es: 'D', price_bob: 5, stock: 1 } } as Req,
      res,
    );
    expect(out[0]).toEqual({ code: 400, body: { error_es: 'Ese SKU ya existe' } });
  });
});

describe('POST /api/admin delete (soft)', () => {
  it('deactivates via PATCH is_active=false with 200', async () => {
    stubServiceEnv();
    const calls = mockFetch([{ includes: '/rest/v1/products', method: 'PATCH', data: [{ sku: 'x' }] }]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { action: 'delete', adminEmail: 'admin@tusitio.bo', sku: 'x' } } as Req, res);
    expect(patchBody(calls[0])).toEqual({ is_active: false });
    expect(out[0]).toEqual({ code: 200, body: { sku: 'x', isActive: false } });
  });

  it('rejects missing sku and unknown actions', async () => {
    stubServiceEnv();
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { action: 'delete', adminEmail: 'admin@tusitio.bo' } } as Req, res);
    expect(out[0]).toEqual({ code: 400, body: { error_es: 'SKU inválido' } });

    const second = makeRes();
    await handler({ method: 'POST', body: { action: 'drop', adminEmail: 'admin@tusitio.bo' } } as Req, second.res);
    expect(second.calls[0]).toEqual({ code: 400, body: { error_es: 'Acción inválida' } });
  });
});
