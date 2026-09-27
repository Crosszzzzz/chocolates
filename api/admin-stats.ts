// GET/POST /api/admin-stats — M13 admin dashboard extension (read-only).
// Gate: ADMIN_EMAILS allow-list (comma-separated) OR role 'admin' resolved from an
// optional userId through the api/me lookup (verified via Supabase Auth admin getUser).
// Same CORS origin pattern as api/admin.ts (Allow-Methods extended with GET for reads).
// Reads only (products/orders/order_items) via service_role (bypasses RLS).
// No DB migration: uses the 001_commerce orders/order_items schema as-is.
// 200 { kpis, recentOrders, topProducts } | 403/405/500 { error_es } (Spanish).
// Rollback: delete this file; shop + admin CRUD keep working without the dashboard.
import { pickRoleFromProfileRow } from './me';

export const LOW_STOCK_THRESHOLD = 5;
export const RECENT_ORDERS_LIMIT = 20;

type Body = { adminEmail?: unknown; admin_email?: unknown; userId?: unknown; user_id?: unknown };
type VercelReq = {
  method?: string;
  headers?: { origin?: string | string[] };
  body?: Body;
  query?: Record<string, string | string[] | undefined>;
};
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

/** ADMIN_EMAILS allow-list check (same gate as api/admin.ts). Pure. */
export function isAdminEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return allowList().includes(email.trim().toLowerCase());
}

// --- Pure logic (covered by src/lib/admin-stats.test.ts) ---

export type StatsProductRow = { sku?: unknown; name_es?: unknown; stock?: unknown; is_active?: unknown };
export type StatsOrderRow = { id?: unknown; total_bob?: unknown; fulfillment?: unknown; status?: unknown; created_at?: unknown };
export type StatsItemRow = { order_id?: unknown; sku?: unknown; qty?: unknown };

export type LowStockItem = { sku: string; nameEs: string; stock: number };
export type DashboardKpis = {
  totalOrders: number; revenueBOB: number; activeProducts: number; outOfStock: number; lowStock: LowStockItem[];
};
export type DashboardRecentOrder = {
  id: string; total_bob: number; fulfillment: string; status: string; created_at: string; itemCount: number;
};
export type DashboardTopProduct = { sku: string; qty: number };

/** Supabase numeric columns may arrive as strings; garbage => 0. Pure. */
export function toStatsNumber(value: unknown): number {
  const n =
    typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value)
    : NaN;
  return Number.isFinite(n) ? n : 0;
}

function toStatsInt(value: unknown): number {
  const n = toStatsNumber(value);
  return Number.isInteger(n) ? n : Math.trunc(n);
}

/**
 * Aggregate dashboard KPIs. Cancelled orders count toward totalOrders but not
 * revenueBOB. lowStock = active products with stock <= LOW_STOCK_THRESHOLD
 * (includes sin stock), sorted by stock ascending. Pure.
 */
export function computeKpis(products: StatsProductRow[], orders: StatsOrderRow[]): DashboardKpis {
  const active = products.filter((p) => p.is_active !== false);
  const withStock = active.map((p) => ({
    sku: typeof p.sku === 'string' ? p.sku : '',
    nameEs: typeof p.name_es === 'string' ? p.name_es : typeof p.sku === 'string' ? p.sku : '',
    stock: toStatsInt(p.stock),
  })).filter((p) => p.sku !== '');
  const outOfStock = withStock.filter((p) => p.stock <= 0).length;
  const lowStock = withStock
    .filter((p) => p.stock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock);
  const revenueBOB =
    Math.round(
      orders
        .filter((o) => String(o.status ?? '') !== 'cancelled')
        .reduce((n, o) => n + toStatsNumber(o.total_bob), 0) * 100,
    ) / 100;
  return { totalOrders: orders.length, revenueBOB, activeProducts: active.length, outOfStock, lowStock };
}

/** Join orders with summed item quantities (itemCount = total units). Pure. */
export function attachItemCounts(orders: StatsOrderRow[], items: StatsItemRow[]): DashboardRecentOrder[] {
  const qtyByOrder = new Map<string, number>();
  for (const item of items) {
    if (typeof item.order_id !== 'string' || item.order_id === '') continue;
    qtyByOrder.set(item.order_id, (qtyByOrder.get(item.order_id) ?? 0) + toStatsInt(item.qty));
  }
  return orders
    .filter((o) => typeof o.id === 'string' && o.id !== '')
    .map((o) => ({
      id: o.id as string,
      total_bob: toStatsNumber(o.total_bob),
      fulfillment: typeof o.fulfillment === 'string' ? o.fulfillment : '',
      status: typeof o.status === 'string' ? o.status : '',
      created_at: typeof o.created_at === 'string' ? o.created_at : '',
      itemCount: qtyByOrder.get(o.id as string) ?? 0,
    }));
}

/** Top SKUs by ordered quantity (desc, sku tie-break for determinism). Pure. */
export function computeTopProducts(items: StatsItemRow[], limit = 5): DashboardTopProduct[] {
  const qtyBySku = new Map<string, number>();
  for (const item of items) {
    if (typeof item.sku !== 'string' || item.sku === '') continue;
    qtyBySku.set(item.sku, (qtyBySku.get(item.sku) ?? 0) + toStatsInt(item.qty));
  }
  return [...qtyBySku.entries()]
    .map(([sku, qty]) => ({ sku, qty }))
    .sort((a, b) => b.qty - a.qty || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

/** Credentials may arrive via POST body or GET query (snake_case aliases accepted). Pure. */
export function readStatsCredentials(req: VercelReq): { adminEmail: unknown; userId: unknown } {
  const body = req.body ?? {};
  const query = req.query ?? {};
  const qEmail = query['adminEmail'] ?? query['admin_email'];
  const qUser = query['userId'] ?? query['user_id'];
  return {
    adminEmail: body.adminEmail ?? body.admin_email ?? (Array.isArray(qEmail) ? qEmail[0] : qEmail),
    userId: body.userId ?? body.user_id ?? (Array.isArray(qUser) ? qUser[0] : qUser),
  };
}

// --- Server helpers ---

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
  const { adminEmail, userId } = readStatsCredentials(req);

  // Gate: allow-list email first (legacy PR5), then role via userId (M10).
  let authed = isAdminEmail(adminEmail);
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const base = url.replace(/\/+$/, '');
  const svc = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
  if (!authed && typeof userId === 'string' && userId.trim() !== '') {
    if (url === '' || key === '') { res.status(403).json({ error_es: 'No autorizado: solo administración' }); return }
    authed = (await fetchRoleByUserId(base, key, userId.trim())) === 'admin';
  }
  if (!authed) { res.status(403).json({ error_es: 'No autorizado: solo administración' }); return }
  if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo cargar el panel' }); return }

  try {
    async function get<T>(path: string): Promise<T | null> {
      const r = await fetch(`${base}${path}`, { headers: svc });
      if (!r.ok) return null;
      return (await r.json().catch(() => null)) as T | null;
    }
    const [products, ordersAll, ordersRecent, items] = await Promise.all([
      get<StatsProductRow[]>('/rest/v1/products?select=sku,name_es,stock,is_active'),
      get<StatsOrderRow[]>('/rest/v1/orders?select=id,total_bob,status&limit=1000'),
      get<StatsOrderRow[]>(
        `/rest/v1/orders?select=id,total_bob,fulfillment,status,created_at&order=created_at.desc&limit=${RECENT_ORDERS_LIMIT}`,
      ),
      get<StatsItemRow[]>('/rest/v1/order_items?select=order_id,sku,qty&limit=1000'),
    ]);
    if (products === null || ordersAll === null || ordersRecent === null || items === null) {
      res.status(500).json({ error_es: 'No se pudo cargar el panel' }); return;
    }
    const productRows = Array.isArray(products) ? products : [];
    const orderRows = Array.isArray(ordersAll) ? ordersAll : [];
    const recentRows = Array.isArray(ordersRecent) ? ordersRecent : [];
    const itemRows = Array.isArray(items) ? items : [];
    res.status(200).json({
      kpis: computeKpis(productRows, orderRows),
      recentOrders: attachItemCounts(recentRows, itemRows),
      topProducts: computeTopProducts(itemRows),
    });
  } catch { res.status(500).json({ error_es: 'No se pudo cargar el panel' }) }
}
