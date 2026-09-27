// GET /api/health — public liveness probe (M15, adapted stack).
// No auth, no secrets echoed: safe for Vercel Cron / UptimeRobot.
// Contract:
//   200 { ok: true,  version, time, checks: { products: { ok: true, latencyMs } } }
//   503 { ok: false, version, time, checks: { products: { ok: false, ... } } }
// NOTE: a degraded products check is LOGGED but NOT sent to Sentry — every uptime
// poll would otherwise spam alerts. Truly unexpected exceptions use reportApiError.
// Rollback: delete this file + e2e/health.spec.ts; nothing else references it.

import { reportApiError } from './_report';

type VercelRequest = {
  method?: string;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  end: (body?: string) => void;
};

// Keep in sync with package.json "version".
const APP_VERSION = '0.0.0';

function getEnv(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

async function checkProductsTable(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  const latencyMs = (): number => Date.now() - started;
  const supabaseUrl = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  if (supabaseUrl === '' || anonKey === '') return { ok: false, latencyMs: latencyMs() };
  try {
    const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/products?select=sku&limit=1`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return { ok: false, latencyMs: latencyMs() };
    // Drain the body so the check proves the table is actually readable.
    const rows: unknown = await response.json().catch(() => null);
    return { ok: Array.isArray(rows), latencyMs: latencyMs() };
  } catch {
    return { ok: false, latencyMs: latencyMs() };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.status(200).end('');
      return;
    }
    if (req.method !== undefined && req.method !== 'GET') {
      res.status(405).json({ error_es: 'Método no permitido' });
      return;
    }
    const products = await checkProductsTable();
    const ok = products.ok;
    const body = {
      ok,
      version: APP_VERSION,
      time: new Date().toISOString(),
      checks: { products },
    };
    if (!ok) console.error(JSON.stringify({ level: 'warn', service: 'api', route: 'health', message: 'products table unreachable', time: body.time }));
    res.setHeader('Cache-Control', 'no-store');
    res.status(ok ? 200 : 503).json(body);
  } catch (err) {
    reportApiError('health', err, undefined, req);
    res.status(503).json({ ok: false, version: APP_VERSION, time: new Date().toISOString(), checks: { products: { ok: false } } });
  }
}
