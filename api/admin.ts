// POST /api/admin — internal catalog/stock CRUD (PR5, mvp-completo).
// Gate (MVP): ADMIN_EMAILS allow-list, comma-separated. Future: profiles.is_admin flag.
// Delivery zones unchanged: Sucre-only enforced in api/checkout.ts (PR4), untouched here.
// Photos: /public placeholders (Storage deferred). See public/images/placeholder.svg.
// Contract: 200 { sku, priceBOB, stock } | 401/403/400/500 { error_es }.
// Rollback: delete this file; shop + checkout keep working without admin.
type Body = { adminEmail?: unknown; sku?: unknown; priceBOB?: unknown; stock?: unknown };
type VercelReq = { method?: string; headers?: { origin?: string | string[] }; body?: Body };
type VercelRes = { setHeader: (n: string, v: string) => void; status: (c: number) => VercelRes; json: (b: unknown) => void; end: (b?: string) => void };
function env(n: string): string { const v = process.env[n]; return typeof v === 'string' ? v.trim() : '' }
const ALLOWED_ORIGINS = ['https://chocolates-zeta.vercel.app', 'http://localhost:3000'];
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.vercel\.app$/i.test(origin);
}
function applyCors(req: VercelReq, res: VercelRes): void {
  const raw = req.headers?.origin;
  const origin = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  if (origin !== '' && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function allowList(): string[] { return env('ADMIN_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '') }
function isAdmin(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return allowList().includes(email.trim().toLowerCase());
}
export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(''); return }
  if (req.method !== undefined && req.method !== 'POST') { res.status(405).json({ error_es: 'Método no permitido' }); return }
  const { adminEmail, sku, priceBOB, stock } = req.body ?? {};
  if (!isAdmin(adminEmail)) { res.status(403).json({ error_es: 'No autorizado: solo administración' }); return }
  const cleanSku = typeof sku === 'string' ? sku.trim() : '';
  if (cleanSku === '') { res.status(400).json({ error_es: 'SKU inválido' }); return }
  const hasPrice = priceBOB !== undefined && priceBOB !== null;
  const hasStock = stock !== undefined && stock !== null;
  if (!hasPrice && !hasStock) { res.status(400).json({ error_es: 'Nada para actualizar' }); return }
  if (hasPrice && (typeof priceBOB !== 'number' || !Number.isFinite(priceBOB) || priceBOB <= 0)) {
    res.status(400).json({ error_es: 'Precio inválido (debe ser mayor a 0)' }); return;
  }
  if (hasStock && (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0)) {
    res.status(400).json({ error_es: 'Stock inválido (debe ser 0 o mayor)' }); return;
  }
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo guardar el cambio' }); return }
  try {
    const patch: Record<string, number> = {};
    if (hasPrice) patch['price_bob'] = priceBOB as number;
    if (hasStock) patch['stock'] = stock as number;
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/products?sku=eq.${encodeURIComponent(cleanSku)}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    const data = (await r.json().catch(() => null)) as { price_bob?: number | string; stock?: number }[] | null;
    if (!r.ok || !Array.isArray(data) || data.length === 0) { res.status(400).json({ error_es: 'No se pudo guardar el cambio' }); return }
    const row = data[0];
    res.status(200).json({ sku: cleanSku, priceBOB: Number(row.price_bob), stock: row.stock });
  } catch { res.status(500).json({ error_es: 'No se pudo guardar el cambio' }) }
}
