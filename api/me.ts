// GET/POST /api/me — M9 role lookup (adapted stack: Supabase Auth, no new backend).
// RLS denies anon/authenticated reads on profiles (001 + 002_roles), so the
// client cannot SELECT its own role. This endpoint (service_role, bypasses RLS)
// accepts a user id, verifies it via Supabase Auth admin getUser, then returns
// the profiles.role row: 200 { email, role } | 401/400/500 { error_es }.
// Existing api/* behavior untouched (checkout/products/admin keep working).
// Rollback: delete this file; AuthContext falls back to role 'turista'.
type UserRole = 'turista' | 'empresa' | 'admin';
const ROLE_VALUES: readonly string[] = ['turista', 'empresa', 'admin'];
type MeBody = { userId?: unknown; accessToken?: unknown };
type VercelReq = { method?: string; headers?: { origin?: string | string[] }; body?: MeBody; query?: Record<string, string | string[] | undefined> };
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
// --- Pure logic (extractable, covered by src/lib/apiMe.test.ts) ---
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeApiRole(value: unknown): UserRole {
  if (typeof value !== 'string') return 'turista';
  const clean = value.trim().toLowerCase();
  return ROLE_VALUES.includes(clean) ? (clean as UserRole) : 'turista';
}
/** Validate the request payload. Pure: returns userId or a Spanish error. */
export function parseMeBody(body: unknown): { ok: true; userId: string } | { ok: false; errorEs: string } {
  const userId = (body as MeBody | null)?.userId;
  if (typeof userId !== 'string' || userId.trim() === '') return { ok: false, errorEs: 'Sesión no válida, inicia sesión de nuevo' };
  if (!UUID_RE.test(userId.trim())) return { ok: false, errorEs: 'Sesión no válida, inicia sesión de nuevo' };
  return { ok: true, userId: userId.trim() };
}
/** Pick the role from a profiles row (or missing row => 'turista'). Pure. */
export function pickRoleFromProfileRow(row: unknown): UserRole {
  if (typeof row !== 'object' || row === null) return 'turista';
  const role = (row as { role?: unknown }).role;
  if (typeof role === 'string' && ROLE_VALUES.includes(role.trim().toLowerCase())) {
    return role.trim().toLowerCase() as UserRole;
  }
  // Pre-002 fallback: boolean flag preserved by the sync trigger.
  if ((row as { is_admin?: unknown }).is_admin === true) return 'admin';
  return 'turista';
}
export function readQueryUserId(query: VercelReq['query']): unknown {
  if (!query) return undefined;
  const raw = query['userId'] ?? query['user_id'];
  return Array.isArray(raw) ? raw[0] : raw;
}
// --- Handler ---
export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(''); return }
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'POST') { res.status(405).json({ error_es: 'Método no permitido' }); return }
  const parsed = parseMeBody(method === 'GET' ? { userId: readQueryUserId(req.query) } : (req.body ?? {}));
  if (parsed.ok === false) { res.status(401).json({ error_es: parsed.errorEs }); return }
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo cargar tu perfil' }); return }
  const base = url.replace(/\/+$/, '');
  const svc = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
  try {
    // Verify the user id via Supabase Auth admin getUser (never trust client alone).
    const adminRes = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(parsed.userId)}`, { headers: svc });
    if (!adminRes.ok) { res.status(401).json({ error_es: 'Sesión no válida, inicia sesión de nuevo' }); return }
    const adminUser = (await adminRes.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof adminUser?.email === 'string' ? adminUser.email : null;
    // Role row via service_role (bypasses RLS). Missing row => fresh user => turista.
    let role: UserRole = 'turista';
    try {
      const profRes = await fetch(`${base}/rest/v1/profiles?select=role,is_admin&id=eq.${encodeURIComponent(parsed.userId)}`, { headers: svc });
      if (profRes.ok) {
        const rows = (await profRes.json().catch(() => null)) as unknown;
        role = pickRoleFromProfileRow(Array.isArray(rows) ? rows[0] : null);
      }
    } catch { role = 'turista' }
    res.status(200).json({ email, role });
  } catch { res.status(500).json({ error_es: 'No se pudo cargar tu perfil' }) }
}
