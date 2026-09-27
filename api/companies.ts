// GET/POST /api/companies — M10 company directory (adapted stack: Supabase + Vercel serverless).
// GET: public list 200 { companies: [{ id, name }] }. Served via service_role because
//   003_catalog.sql keeps companies RLS deny-by-default (no policies); only id+name
//   are exposed, so the endpoint stays anon-safe.
// POST: create 201 { company: { id, name } }, gated by role admin/empresa resolved
//   from userId through the api/me lookup (verified via Supabase Auth admin getUser),
//   or by the ADMIN_EMAILS allow-list (adminEmail, same convention as api/admin.ts).
// Existing api/* behavior untouched (products/search/admin/me keep working).
// Contract errors: 400/403/405/500 { error_es } (Spanish).
// Rollback: delete this file + drop public.companies (see 003_catalog.sql bottom).

export type CompanyEntry = { id: string; name: string };

type CompaniesBody = { name?: unknown; userId?: unknown; adminEmail?: unknown };
type VercelReq = { method?: string; headers?: { origin?: string | string[] }; body?: CompaniesBody };
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function allowList(): string[] { return env('ADMIN_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '') }
function isAdminEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return allowList().includes(email.trim().toLowerCase());
}

// --- Pure logic (covered by src/lib/companies.test.ts) ---

export const MAX_COMPANY_NAME = 120;

/** Validate the company name. Pure: returns the trimmed name or a Spanish error. */
export function validateCompanyName(body: CompaniesBody | null | undefined): { ok: true; name: string } | { ok: false; errorEs: string } {
  const raw = body?.name;
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '' || name.length > MAX_COMPANY_NAME) return { ok: false, errorEs: 'Nombre de empresa inválido' };
  return { ok: true, name };
}

/** Roles allowed to create companies. Pure. */
export function canCreateCompanyWithRole(role: unknown): boolean {
  return role === 'admin' || role === 'empresa';
}

/** Pick a public { id, name } entry from a companies row (or null). Pure. */
export function normalizeCompanyRow(row: unknown): CompanyEntry | null {
  if (typeof row !== 'object' || row === null) return null;
  const id = (row as { id?: unknown }).id;
  const name = (row as { name?: unknown }).name;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') return null;
  return { id, name };
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
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'POST') { res.status(405).json({ error_es: 'Método no permitido' }); return }
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const base = url.replace(/\/+$/, '');
  const svc = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };

  if (method === 'GET') {
    if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudieron cargar las empresas' }); return }
    try {
      const r = await fetch(`${base}/rest/v1/companies?select=id,name&order=name`, { headers: svc });
      if (!r.ok) { res.status(500).json({ error_es: 'No se pudieron cargar las empresas' }); return }
      const rows = (await r.json().catch(() => null)) as unknown;
      const companies = Array.isArray(rows)
        ? rows.map(normalizeCompanyRow).filter((c): c is CompanyEntry => c !== null)
        : [];
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      res.status(200).json({ companies });
    } catch { res.status(500).json({ error_es: 'No se pudieron cargar las empresas' }) }
    return;
  }

  // POST: create company (admin or empresa role, or ADMIN_EMAILS allow-list).
  const body = req.body ?? {};
  const parsed = validateCompanyName(body);
  if (parsed.ok === false) { res.status(400).json({ error_es: parsed.errorEs }); return }
  if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo crear la empresa' }); return }
  let authed = isAdminEmail(body.adminEmail);
  let ownerId: string | null = null;
  if (!authed && typeof body.userId === 'string' && body.userId.trim() !== '') {
    const userId = body.userId.trim();
    authed = canCreateCompanyWithRole(await fetchRoleByUserId(base, key, userId));
    if (authed && UUID_RE.test(userId)) ownerId = userId;
  }
  if (!authed) { res.status(403).json({ error_es: 'No autorizado: solo administración o empresas' }); return }
  try {
    const r = await fetch(`${base}/rest/v1/companies`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ name: parsed.name, owner_profile_id: ownerId }),
    });
    if (r.status === 409) { res.status(400).json({ error_es: 'Esa empresa ya existe' }); return }
    const data = (await r.json().catch(() => null)) as unknown;
    const company = normalizeCompanyRow(Array.isArray(data) ? data[0] : null);
    if (!r.ok || company === null) { res.status(400).json({ error_es: 'No se pudo crear la empresa' }); return }
    res.status(201).json({ company });
  } catch { res.status(500).json({ error_es: 'No se pudo crear la empresa' }) }
}
