// GET/PUT/DELETE /api/cart — M11 server cart (adapted stack: Supabase + Vercel serverless).
// Logged-in users persist their cart across devices; localStorage stays as the
// offline cache/fallback and the guest (logged-out) flow never calls this endpoint.
// RLS denies anon/authenticated access to carts/cart_items (004_carts), so every
// route runs with service_role (bypasses RLS) after verifying userId via the
// Supabase Auth admin getUser endpoint — same pattern as api/me.ts (never trust
// the client-supplied id alone).
// Works WITH or WITHOUT migrations 002/003: it only reads public.profiles(id)
// + public.products(sku, stock, is_active) from 001. If 004 itself is not applied
// yet, routes answer 503 { error_es, code: 'CARTS_TABLE_MISSING' } so the client
// keeps its local cart instead of merging against a phantom empty server cart.
// Contract:
//   GET    ?userId=uuid            -> 200 { lines } | 401/500/503 { error_es }
//   PUT    { userId, lines }       -> 200 { lines, warnings } | 400/401/500/503
//   DELETE ?userId=uuid            -> 200 { lines: [] } | 401/500/503
// Rollback: delete this file + 004 tables; CartContext falls back to localStorage.

// --- Pure logic lives in src/lib/cart.ts (client-safe: no secrets, no fetch). ---
// Re-exported here so existing server/test imports keep working. The browser
// bundle MUST import from src/lib/cart instead: under `vercel dev`, /api/*
// URLs are routed to serverless functions, so a client-side `import` of this
// file resolves to a 401 JSON response, the module graph fails, and #root
// stays empty (total black screen, no navbar).
import {
  buildCartLookupUrl,
  buildProductsStockUrl,
  CARTS_TABLE_MISSING,
  clampCartLines,
  isMissingTableError,
  MAX_CART_LINES,
  parseCartLines,
  parseCartUserId,
  readQueryUserId,
  type CartLine,
  type ProductStockRow,
} from '../src/lib/cart';
export {
  buildCartLookupUrl,
  buildProductsStockUrl,
  CARTS_TABLE_MISSING,
  clampCartLines,
  isMissingTableError,
  MAX_CART_LINES,
  mergeCarts,
  parseCartLines,
  parseCartUserId,
  readQueryUserId,
} from '../src/lib/cart';
export type { CartLine, CartQuery, ProductStockRow } from '../src/lib/cart';

type VercelReq = {
  method?: string;
  headers?: { origin?: string | string[] };
  body?: { userId?: unknown; lines?: unknown };
  query?: Record<string, string | string[] | undefined>;
};
type VercelRes = {
  setHeader: (n: string, v: string) => void;
  status: (c: number) => VercelRes;
  json: (b: unknown) => void;
  end: (b?: string) => void;
};

function env(n: string): string {
  const v = process.env[n];
  return typeof v === 'string' ? v.trim() : '';
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// --- Pure logic (covered by src/lib/cart.test.ts) ---

// --- Handler ---

type Svc = { apikey: string; Authorization: string; Accept: string };

async function verifyUser(base: string, svc: Svc, userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: svc });
    return res.ok;
  } catch {
    return false;
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toCartLines(rows: unknown): CartLine[] {
  if (!Array.isArray(rows)) return [];
  const out: CartLine[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const sku = (row as { sku?: unknown }).sku;
    const qty = (row as { qty?: unknown }).qty;
    if (typeof sku === 'string' && sku.trim() !== '' && Number.isInteger(qty) && (qty as number) > 0) {
      out.push({ sku: sku.trim(), qty: qty as number });
    }
  }
  return out;
}

function toStockRows(rows: unknown): ProductStockRow[] {
  if (!Array.isArray(rows)) return [];
  const out: ProductStockRow[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const rec = row as { sku?: unknown; stock?: unknown; is_active?: unknown };
    if (typeof rec.sku !== 'string' || typeof rec.stock !== 'number' || typeof rec.is_active !== 'boolean') continue;
    out.push({ sku: rec.sku, stock: rec.stock, is_active: rec.is_active });
  }
  return out;
}

async function handleGet(base: string, svc: Svc, userId: string, res: VercelRes): Promise<void> {
  const lookup = await fetch(buildCartLookupUrl(base, userId), { headers: svc }).catch(() => null);
  if (lookup === null) {
    res.status(500).json({ error_es: 'No se pudo cargar el carrito' });
    return;
  }
  const lookupBody = await readJson(lookup);
  if (!lookup.ok) {
    if (isMissingTableError(lookup.status, lookupBody)) {
      res.status(503).json({ error_es: 'Carrito del servidor no disponible todavía', code: CARTS_TABLE_MISSING });
      return;
    }
    res.status(500).json({ error_es: 'No se pudo cargar el carrito' });
    return;
  }
  const carts = Array.isArray(lookupBody) ? (lookupBody as { id?: unknown }[]) : [];
  const cartId = typeof carts[0]?.id === 'string' ? (carts[0]?.id as string) : null;
  if (cartId === null) {
    res.status(200).json({ lines: [] });
    return;
  }
  const items = await fetch(`${base}/rest/v1/cart_items?select=sku,qty&cart_id=eq.${encodeURIComponent(cartId)}&order=sku`, {
    headers: svc,
  }).catch(() => null);
  if (items === null || !items.ok) {
    res.status(500).json({ error_es: 'No se pudo cargar el carrito' });
    return;
  }
  res.status(200).json({ lines: toCartLines(await readJson(items)) });
}

async function handlePut(base: string, svc: Svc, userId: string, rawLines: unknown, res: VercelRes): Promise<void> {
  const parsed = parseCartLines(rawLines);
  if (parsed.ok === false) {
    res.status(400).json({ error_es: parsed.errorEs });
    return;
  }

  // Validate SKUs against live catalog (001 columns only — no 002/003 dependency).
  let clamped: CartLine[] = [];
  let warnings: string[] = [];
  if (parsed.lines.length > 0) {
    const stockRes = await fetch(buildProductsStockUrl(base, parsed.lines.map((l) => l.sku)), { headers: svc }).catch(
      () => null,
    );
    if (stockRes === null) {
      res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
      return;
    }
    const stockBody = await readJson(stockRes);
    if (!stockRes.ok) {
      if (isMissingTableError(stockRes.status, stockBody)) {
        res.status(503).json({ error_es: 'Carrito del servidor no disponible todavía', code: CARTS_TABLE_MISSING });
        return;
      }
      res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
      return;
    }
    const result = clampCartLines(parsed.lines, toStockRows(stockBody));
    clamped = result.lines;
    warnings = result.warnings;
  }

  // Find-or-create the user's cart row.
  const lookup = await fetch(buildCartLookupUrl(base, userId), { headers: svc }).catch(() => null);
  if (lookup === null) {
    res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
    return;
  }
  const lookupBody = await readJson(lookup);
  if (!lookup.ok) {
    if (isMissingTableError(lookup.status, lookupBody)) {
      res.status(503).json({ error_es: 'Carrito del servidor no disponible todavía', code: CARTS_TABLE_MISSING });
      return;
    }
    res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
    return;
  }
  const carts = Array.isArray(lookupBody) ? (lookupBody as { id?: unknown }[]) : [];
  let cartId = typeof carts[0]?.id === 'string' ? (carts[0]?.id as string) : null;
  if (cartId === null) {
    const created = await fetch(`${base}/rest/v1/carts`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId }),
    }).catch(() => null);
    if (created === null || !created.ok) {
      res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
      return;
    }
    const createdBody = (await readJson(created)) as { id?: unknown }[] | null;
    cartId = Array.isArray(createdBody) && typeof createdBody[0]?.id === 'string' ? (createdBody[0]?.id as string) : null;
    if (cartId === null) {
      res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
      return;
    }
  }

  // Replace items: delete all, then insert the clamped set (empty = cleared cart).
  const cleared = await fetch(`${base}/rest/v1/cart_items?cart_id=eq.${encodeURIComponent(cartId)}`, {
    method: 'DELETE',
    headers: svc,
  }).catch(() => null);
  if (cleared === null || !cleared.ok) {
    res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
    return;
  }
  if (clamped.length > 0) {
    const inserted = await fetch(`${base}/rest/v1/cart_items`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify(clamped.map((l) => ({ cart_id: cartId, sku: l.sku, qty: l.qty }))),
    }).catch(() => null);
    if (inserted === null || !inserted.ok) {
      res.status(500).json({ error_es: 'No se pudo guardar el carrito' });
      return;
    }
  }
  res.status(200).json({ lines: clamped, warnings });
}

async function handleDelete(base: string, svc: Svc, userId: string, res: VercelRes): Promise<void> {
  // Deleting the cart row cascades to cart_items (004 FK on delete cascade).
  const deleted = await fetch(`${base}/rest/v1/carts?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: svc,
  }).catch(() => null);
  if (deleted === null) {
    res.status(500).json({ error_es: 'No se pudo vaciar el carrito' });
    return;
  }
  if (!deleted.ok) {
    if (isMissingTableError(deleted.status, await readJson(deleted))) {
      res.status(503).json({ error_es: 'Carrito del servidor no disponible todavía', code: CARTS_TABLE_MISSING });
      return;
    }
    res.status(500).json({ error_es: 'No se pudo vaciar el carrito' });
    return;
  }
  res.status(200).json({ lines: [] });
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end('');
    return;
  }
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'PUT' && method !== 'DELETE') {
    res.status(405).json({ error_es: 'Método no permitido' });
    return;
  }

  const parsedUser =
    method === 'PUT' ? parseCartUserId(req.body?.userId) : parseCartUserId(readQueryUserId(req.query));
  if (parsedUser.ok === false) {
    res.status(401).json({ error_es: parsedUser.errorEs });
    return;
  }

  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url === '' || key === '') {
    res.status(500).json({ error_es: 'No se pudo cargar el carrito' });
    return;
  }
  const base = url.replace(/\/+$/, '');
  const svc: Svc = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };

  if (!(await verifyUser(base, svc, parsedUser.userId))) {
    res.status(401).json({ error_es: 'Sesión no válida, inicia sesión de nuevo' });
    return;
  }

  if (method === 'GET') {
    await handleGet(base, svc, parsedUser.userId, res);
    return;
  }
  if (method === 'PUT') {
    await handlePut(base, svc, parsedUser.userId, req.body?.lines, res);
    return;
  }
  await handleDelete(base, svc, parsedUser.userId, res);
}
