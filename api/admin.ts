// POST /api/admin — internal catalog/stock CRUD (PR5, mvp-completo; extended M10).
// Gate: ADMIN_EMAILS allow-list (comma-separated) OR role 'admin' resolved from an
// optional userId through the api/me lookup (verified via Supabase Auth admin getUser).
// The email path keeps working unchanged.
// Actions (body.action; omitted => 'update', the legacy PR5 contract):
//   update (default): { adminEmail, sku, priceBOB?, stock? } -> 200 { sku, priceBOB, stock }.
//   create: { name_es|nameEs, sku, price_bob|priceBOB, stock, company_id|companyId? } -> 201 { sku, nameEs, priceBOB, stock }.
//   delete: { sku } soft-deactivates (is_active=false) -> 200 { sku, isActive: false }.
// Delivery zones unchanged: Sucre-only enforced in api/checkout.ts (PR4), untouched here.
// Photos: /public placeholders (Storage deferred). See public/images/placeholder.svg.
// Contract errors: 401/403/400/405/500 { error_es } (Spanish).
// Rollback: delete the create/delete branches (or this file); shop + checkout keep working without admin.

export type AdminAction = 'update' | 'create' | 'delete';
type Body = {
  adminEmail?: unknown; userId?: unknown; action?: unknown;
  sku?: unknown; priceBOB?: unknown; stock?: unknown;
  name_es?: unknown; nameEs?: unknown; price_bob?: unknown;
  company_id?: unknown; companyId?: unknown;
};
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function allowList(): string[] { return env('ADMIN_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '') }

/** ADMIN_EMAILS allow-list check (legacy PR5 gate). Pure. */
export function isAdminEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return allowList().includes(email.trim().toLowerCase());
}

// --- Pure logic (covered by src/lib/admin.test.ts) ---

/** Missing action => legacy 'update'; unknown strings => null (400). Pure. */
export function parseAdminAction(value: unknown): AdminAction | null {
  if (value === undefined || value === null || value === '') return 'update';
  if (value === 'update' || value === 'create' || value === 'delete') return value;
  return null;
}

export type CreateProductInput = { sku: string; nameEs: string; priceBOB: number; stock: number; companyId: string | null };

/** Validate a create-product body (snake_case preferred, camelCase aliases accepted). Pure. */
export function validateCreateProduct(body: Body): { ok: true; value: CreateProductInput } | { ok: false; errorEs: string } {
  const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
  if (sku === '') return { ok: false, errorEs: 'SKU inválido' };
  const rawName = typeof body.name_es === 'string' ? body.name_es : body.nameEs;
  const nameEs = typeof rawName === 'string' ? rawName.trim() : '';
  if (nameEs === '') return { ok: false, errorEs: 'Nombre inválido' };
  const rawPrice = body.price_bob !== undefined && body.price_bob !== null ? body.price_bob : body.priceBOB;
  if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) {
    return { ok: false, errorEs: 'Precio inválido (debe ser mayor a 0)' };
  }
  if (typeof body.stock !== 'number' || !Number.isInteger(body.stock) || body.stock < 0) {
    return { ok: false, errorEs: 'Stock inválido (debe ser 0 o mayor)' };
  }
  const rawCompany =
    body.company_id !== undefined && body.company_id !== null && body.company_id !== ''
      ? body.company_id
      : body.companyId;
  if (rawCompany === undefined || rawCompany === null || rawCompany === '') {
    return { ok: true, value: { sku, nameEs, priceBOB: rawPrice, stock: body.stock, companyId: null } };
  }
  if (typeof rawCompany !== 'string' || !UUID_RE.test(rawCompany.trim())) {
    return { ok: false, errorEs: 'Empresa inválida' };
  }
  return { ok: true, value: { sku, nameEs, priceBOB: rawPrice, stock: body.stock, companyId: rawCompany.trim() } };
}

/** Validate a soft-delete body. Pure. */
export function validateDeleteProduct(body: Body): { ok: true; sku: string } | { ok: false; errorEs: string } {
  const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
  if (sku === '') return { ok: false, errorEs: 'SKU inválido' };
  return { ok: true, sku };
}

// --- Server helpers ---

// Inlined from api/me.ts (Vercel compiles each api/*.ts standalone without
// bundling sibling imports, so a sibling import crashes live with ERR_MODULE_NOT_FOUND).
type UserRole = 'turista' | 'empresa' | 'admin';
const ROLE_VALUES: readonly string[] = ['turista', 'empresa', 'admin'];
/** Pick the role from a profiles row (or missing row => 'turista'). Pure. */
function pickRoleFromProfileRow(row: unknown): UserRole {
  if (typeof row !== 'object' || row === null) return 'turista';
  const role = (row as { role?: unknown }).role;
  if (typeof role === 'string' && ROLE_VALUES.includes(role.trim().toLowerCase())) {
    return role.trim().toLowerCase() as UserRole;
  }
  // Pre-002 fallback: boolean flag preserved by the sync trigger.
  if ((row as { is_admin?: unknown }).is_admin === true) return 'admin';
  return 'turista';
}

/** Resolve the api/me role for a userId (verified via Auth admin getUser; untrusted ids => turista). */
async function fetchRoleByUserId(base: string, serviceKey: string, userId: string): Promise<string> {
  if (!UUID_RE.test(userId)) return 'turista';
  const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' };
  try {
    const adminRes = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: svc });
    if (!adminRes.ok) return 'turista';
    const profRes = await fetch(`${base}/rest/v1/profiles?select=role,is_admin&id=eq.${encodeURIComponent(userId)}`, { headers: svc });
    if (!profRes.ok) return 'turista';
    const rows = (await profRes.json().catch(() => null)) as unknown;
    return pickRoleFromProfileRow(Array.isArray(rows) ? rows[0] : null);
  } catch { return 'turista' }
}

// --- Handler ---

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(''); return }
  if (req.method !== undefined && req.method !== 'POST') { res.status(405).json({ error_es: 'Método no permitido' }); return }
  const body = req.body ?? {};
  const action = parseAdminAction(body.action);
  if (action === null) { res.status(400).json({ error_es: 'Acción inválida' }); return }

  // Gate: allow-list email first (legacy PR5), then role via userId (M10).
  let authed = isAdminEmail(body.adminEmail);
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const base = url.replace(/\/+$/, '');
  const svc = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
  if (!authed && typeof body.userId === 'string' && body.userId.trim() !== '') {
    if (url === '' || key === '') { res.status(403).json({ error_es: 'No autorizado: solo administración' }); return }
    authed = (await fetchRoleByUserId(base, key, body.userId.trim())) === 'admin';
  }
  if (!authed) { res.status(403).json({ error_es: 'No autorizado: solo administración' }); return }

  if (action === 'create') {
    const parsed = validateCreateProduct(body);
    if (parsed.ok === false) { res.status(400).json({ error_es: parsed.errorEs }); return }
    if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo crear el producto' }); return }
    try {
      if (parsed.value.companyId !== null) {
        const chk = await fetch(`${base}/rest/v1/companies?select=id&id=eq.${encodeURIComponent(parsed.value.companyId)}`, { headers: svc });
        const chkRows = (await chk.json().catch(() => null)) as unknown;
        if (!chk.ok || !Array.isArray(chkRows) || chkRows.length === 0) {
          res.status(400).json({ error_es: 'Empresa inválida' }); return;
        }
      }
      const r = await fetch(`${base}/rest/v1/products`, {
        method: 'POST',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          sku: parsed.value.sku,
          name_es: parsed.value.nameEs,
          price_bob: parsed.value.priceBOB,
          stock: parsed.value.stock,
          is_active: true,
          ...(parsed.value.companyId !== null ? { company_id: parsed.value.companyId } : {}),
        }),
      });
      if (r.status === 409) { res.status(400).json({ error_es: 'Ese SKU ya existe' }); return }
      const data = (await r.json().catch(() => null)) as { name_es?: unknown; price_bob?: number | string; stock?: number }[] | null;
      if (!r.ok || !Array.isArray(data) || data.length === 0) { res.status(400).json({ error_es: 'No se pudo crear el producto' }); return }
      const row = data[0];
      res.status(201).json({
        sku: parsed.value.sku,
        nameEs: typeof row.name_es === 'string' ? row.name_es : parsed.value.nameEs,
        priceBOB: Number(row.price_bob),
        stock: row.stock,
      });
    } catch { res.status(500).json({ error_es: 'No se pudo crear el producto' }) }
    return;
  }

  if (action === 'delete') {
    const parsed = validateDeleteProduct(body);
    if (parsed.ok === false) { res.status(400).json({ error_es: parsed.errorEs }); return }
    if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo eliminar el producto' }); return }
    try {
      const r = await fetch(`${base}/rest/v1/products?sku=eq.${encodeURIComponent(parsed.sku)}`, {
        method: 'PATCH',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ is_active: false }),
      });
      const data = (await r.json().catch(() => null)) as unknown[] | null;
      if (!r.ok || !Array.isArray(data) || data.length === 0) { res.status(400).json({ error_es: 'No se pudo eliminar el producto' }); return }
      res.status(200).json({ sku: parsed.sku, isActive: false });
    } catch { res.status(500).json({ error_es: 'No se pudo eliminar el producto' }) }
    return;
  }

  // Legacy PR5 update contract (unchanged): { sku, priceBOB?, stock? }.
  const { sku, priceBOB, stock } = body;
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
  if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo guardar el cambio' }); return }
  try {
    const patch: Record<string, number> = {};
    if (hasPrice) patch['price_bob'] = priceBOB as number;
    if (hasStock) patch['stock'] = stock as number;
    const r = await fetch(`${base}/rest/v1/products?sku=eq.${encodeURIComponent(cleanSku)}`, {
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
