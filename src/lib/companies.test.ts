import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
  canCreateCompanyWithRole,
  normalizeCompanyRow,
  validateCompanyName,
} from '../../api/companies';

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

function stubServiceEnv(): void {
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('validateCompanyName', () => {
  it('accepts trimmed names up to 120 chars', () => {
    expect(validateCompanyName({ name: '  Para Ti  ' })).toEqual({ ok: true, name: 'Para Ti' });
  });

  it('rejects missing, empty, and overlong names in Spanish', () => {
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: 42 }, { name: 'x'.repeat(121) }, null]) {
      const parsed = validateCompanyName(body as { name?: unknown });
      expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.errorEs).toBe('Nombre de empresa inválido');
    }
  });
});

describe('canCreateCompanyWithRole', () => {
  it('allows admin and empresa only', () => {
    expect(canCreateCompanyWithRole('admin')).toBe(true);
    expect(canCreateCompanyWithRole('empresa')).toBe(true);
    expect(canCreateCompanyWithRole('turista')).toBe(false);
    expect(canCreateCompanyWithRole(null)).toBe(false);
  });
});

describe('normalizeCompanyRow', () => {
  it('picks id+name and rejects garbage', () => {
    expect(normalizeCompanyRow({ id: '1', name: 'Para Ti', extra: 1 })).toEqual({ id: '1', name: 'Para Ti' });
    expect(normalizeCompanyRow(null)).toBe(null);
    expect(normalizeCompanyRow({ id: '1' })).toBe(null);
    expect(normalizeCompanyRow({ name: 'x' })).toBe(null);
  });
});

describe('GET /api/companies handler', () => {
  it('lists companies publicly via service_role', async () => {
    stubServiceEnv();
    const calls = mockFetch([{ includes: '/rest/v1/companies', data: [{ id: '1', name: 'Para Ti' }] }]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET' } as Req, res);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('select=id,name');
    expect(out[0]).toEqual({ code: 200, body: { companies: [{ id: '1', name: 'Para Ti' }] } });
  });

  it('maps missing env to a Spanish 500', async () => {
    const { res, calls: out } = makeRes();
    await handler({ method: 'GET' } as Req, res);
    expect(out[0]).toEqual({ code: 500, body: { error_es: 'No se pudieron cargar las empresas' } });
  });
});

describe('POST /api/companies handler', () => {
  it('creates a company for the empresa role and records ownership', async () => {
    stubServiceEnv();
    const calls = mockFetch([
      { includes: '/auth/v1/admin/users/', data: { email: 'tienda@ejemplo.bo' } },
      { includes: '/rest/v1/profiles', data: [{ role: 'empresa' }] },
      { includes: '/rest/v1/companies', method: 'POST', status: 201, data: [{ id: 'c1', name: 'Tienda Sur' }] },
    ]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { name: 'Tienda Sur', userId: UUID } } as Req, res);
    const insert = calls.find((c) => (c.init as { method?: string })?.method === 'POST');
    expect(JSON.parse(String((insert?.init as { body?: string })?.body))).toEqual({
      name: 'Tienda Sur',
      owner_profile_id: UUID,
    });
    expect(out[0]).toEqual({ code: 201, body: { company: { id: 'c1', name: 'Tienda Sur' } } });
  });

  it('creates a company for the ADMIN_EMAILS allow-list', async () => {
    stubServiceEnv();
    vi.stubEnv('ADMIN_EMAILS', 'admin@tusitio.bo');
    mockFetch([{ includes: '/rest/v1/companies', method: 'POST', status: 201, data: [{ id: 'c1', name: 'Casa Central' }] }]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { name: 'Casa Central', adminEmail: 'admin@tusitio.bo' } } as Req, res);
    expect(out[0].code).toBe(201);
  });

  it('denies turista with 403', async () => {
    stubServiceEnv();
    mockFetch([
      { includes: '/auth/v1/admin/users/', data: { email: 't@ejemplo.bo' } },
      { includes: '/rest/v1/profiles', data: [{ role: 'turista' }] },
    ]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { name: 'X', userId: UUID } } as Req, res);
    expect(out[0]).toEqual({ code: 403, body: { error_es: 'No autorizado: solo administración o empresas' } });
  });

  it('maps duplicate names to a Spanish 400', async () => {
    stubServiceEnv();
    vi.stubEnv('ADMIN_EMAILS', 'admin@tusitio.bo');
    mockFetch([{ includes: '/rest/v1/companies', method: 'POST', ok: false, status: 409, data: null }]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { name: 'Duplicada', adminEmail: 'admin@tusitio.bo' } } as Req, res);
    expect(out[0]).toEqual({ code: 400, body: { error_es: 'Esa empresa ya existe' } });
  });

  it('rejects invalid names before any gate check', async () => {
    stubServiceEnv();
    const calls = mockFetch([]);
    const { res, calls: out } = makeRes();
    await handler({ method: 'POST', body: { name: '' } } as Req, res);
    expect(calls).toHaveLength(0);
    expect(out[0]).toEqual({ code: 400, body: { error_es: 'Nombre de empresa inválido' } });
  });
});
