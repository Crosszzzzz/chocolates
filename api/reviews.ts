// GET/POST/PATCH /api/reviews — M14 ratings + moderation (adapted stack: Supabase + Vercel serverless).
// Table: public.reviews from supabase/migrations/005_ratings.sql (runs on top of 001+002+003+004).
// RLS denies anon/authenticated access (deny-by-default, like 001-004), so every
// route runs with service_role (bypasses RLS). POST verifies the user via the
// Supabase Auth admin getUser endpoint — same pattern as api/me.ts (never trust
// the client-supplied id alone) — and requires a past order containing the sku
// (orders.user_id + order_items, added in 005; api/checkout.ts fills user_id
// best-effort). Without a verified purchase: 403 'Solo quienes compraron pueden opinar'.
// Contract:
//   GET    ?sku=<sku>                                   -> 200 { reviews, average, count } (approved only, public)
//   GET    ?status=pending|rejected&adminEmail=|userId=  -> 200 { reviews } (admin only, moderation queue)
//   POST   { userId, sku, rating, comment? }             -> 201 { id, status: 'pending' } | 400/401/403/500/503 { error_es }
//   PATCH  { adminEmail|userId, reviewId, status }       -> 200 { id, status } | 400/403/404/500 { error_es }
// Rollback: delete this file + 005 tables; shop + admin keep working without reviews.

// Inlined from api/me.ts (Vercel compiles each api/*.ts standalone without
// bundling sibling imports, so a sibling import crashes live with ERR_MODULE_NOT_FOUND).

// --- Types ---

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export const REVIEW_STATUSES: readonly string[] = ['pending', 'approved', 'rejected'];
export const MAX_COMMENT_LENGTH = 1000;

export interface ApprovedReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface PendingReview extends ApprovedReview {
  sku: string;
  userId: string;
  status: ReviewStatus;
}

type VercelReq = {
  method?: string;
  headers?: { origin?: string | string[] };
  body?: Record<string, unknown>;
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function allowList(): string[] {
  return env('ADMIN_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '');
}

/** ADMIN_EMAILS allow-list check (same gate as api/admin.ts). Pure. */
export function isAdminEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return allowList().includes(email.trim().toLowerCase());
}

// --- Pure logic (covered by src/lib/reviews.test.ts) ---

/** Validate a 1-5 integer rating. Pure. */
export function parseReviewRating(value: unknown): { ok: true; rating: number } | { ok: false; errorEs: string } {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    return { ok: false, errorEs: 'Calificación inválida (debe ser de 1 a 5 estrellas)' };
  }
  return { ok: true, rating: value };
}

/** Trim + cap a comment (empty allowed). Pure. */
export function normalizeReviewComment(value: unknown): { ok: true; comment: string } | { ok: false; errorEs: string } {
  if (value === undefined || value === null || value === '') return { ok: true, comment: '' };
  if (typeof value !== 'string') return { ok: false, errorEs: 'Comentario inválido' };
  const comment = value.trim();
  if (comment.length > MAX_COMMENT_LENGTH) return { ok: false, errorEs: 'Comentario demasiado largo (máximo 1000 caracteres)' };
  return { ok: true, comment };
}

export type ReviewPostInput = { userId: string; sku: string; rating: number; comment: string };

/** Validate a POST body. Pure: returns the cleaned input or a Spanish error. */
export function parseReviewBody(body: Record<string, unknown> | null | undefined): { ok: true; value: ReviewPostInput } | { ok: false; errorEs: string } {
  const raw = body ?? {};
  const userId = typeof raw['userId'] === 'string' ? (raw['userId'] as string).trim() : '';
  if (userId === '' || !UUID_RE.test(userId)) return { ok: false, errorEs: 'Sesión no válida, inicia sesión de nuevo' };
  const sku = typeof raw['sku'] === 'string' ? (raw['sku'] as string).trim() : '';
  if (sku === '') return { ok: false, errorEs: 'SKU inválido' };
  const rating = parseReviewRating(raw['rating']);
  if (rating.ok === false) return rating;
  const comment = normalizeReviewComment(raw['comment']);
  if (comment.ok === false) return comment;
  return { ok: true, value: { userId, sku, rating: rating.rating, comment: comment.comment } };
}

export type ModerationInput = { reviewId: string; status: ReviewStatus };

/** Validate a PATCH moderation body. Pure. */
export function parseModerationBody(body: Record<string, unknown> | null | undefined): { ok: true; value: ModerationInput } | { ok: false; errorEs: string } {
  const raw = body ?? {};
  const reviewId = typeof raw['reviewId'] === 'string' ? (raw['reviewId'] as string).trim() : '';
  if (reviewId === '' || !UUID_RE.test(reviewId)) return { ok: false, errorEs: 'Opinión inválida' };
  const status = typeof raw['status'] === 'string' ? (raw['status'] as string).trim().toLowerCase() : '';
  if (status !== 'approved' && status !== 'rejected') return { ok: false, errorEs: 'Estado inválido (solo aprobada o rechazada)' };
  return { ok: true, value: { reviewId, status } };
}

/** First query value wins (same helper shape as api/me.ts). Pure. */
export function readFirstQuery(query: VercelReq['query'], ...names: string[]): string | undefined {
  if (!query) return undefined;
  for (const name of names) {
    const raw = query[name];
    if (Array.isArray(raw)) return raw[0];
    if (typeof raw === 'string') return raw;
  }
  return undefined;
}

export type ApprovedRow = { id?: unknown; rating?: unknown; comment?: unknown; created_at?: unknown };

function toApprovedReview(row: ApprovedRow): ApprovedReview | null {
  if (typeof row.id !== 'string' || row.id === '') return null;
  const rating = typeof row.rating === 'number' ? row.rating : Number(row.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return {
    id: row.id,
    rating,
    comment: typeof row.comment === 'string' ? row.comment : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  };
}

/** Shape approved rows + compute the average (1 decimal). Pure. */
export function summarizeApprovedReviews(rows: unknown): { reviews: ApprovedReview[]; average: number; count: number } {
  const reviews = (Array.isArray(rows) ? rows : [])
    .map((r) => toApprovedReview(r as ApprovedRow))
    .filter((r): r is ApprovedReview => r !== null);
  const count = reviews.length;
  const average = count === 0 ? 0 : Math.round((reviews.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10;
  return { reviews, average, count };
}

export type QueueRow = ApprovedRow & { product_sku?: unknown; user_id?: unknown; status?: unknown };

/** Shape moderation-queue rows (pending/rejected). Pure. */
export function toQueueReviews(rows: unknown): PendingReview[] {
  if (!Array.isArray(rows)) return [];
  const out: PendingReview[] = [];
  for (const item of rows) {
    const row = item as QueueRow;
    const base = toApprovedReview(row);
    if (base === null) continue;
    if (typeof row.product_sku !== 'string' || row.product_sku === '') continue;
    if (typeof row.user_id !== 'string' || row.user_id === '') continue;
    if (row.status !== 'pending' && row.status !== 'rejected' && row.status !== 'approved') continue;
    out.push({ ...base, sku: row.product_sku, userId: row.user_id, status: row.status });
  }
  return out;
}

/** PostgREST URL: approved reviews for a sku, newest first. Pure. */
export function buildApprovedReviewsUrl(base: string, sku: string): string {
  return `${base}/rest/v1/reviews?select=id,rating,comment,created_at&product_sku=eq.${encodeURIComponent(sku)}&status=eq.approved&order=created_at.desc&limit=100`;
}

/** PostgREST URL: moderation queue (optionally filtered by sku). Pure. */
export function buildQueueReviewsUrl(base: string, status: string, sku?: string): string {
  const skuFilter = sku ? `&product_sku=eq.${encodeURIComponent(sku)}` : '';
  return `${base}/rest/v1/reviews?select=id,product_sku,user_id,rating,comment,status,created_at&status=eq.${encodeURIComponent(status)}${skuFilter}&order=created_at.desc&limit=100`;
}

/** PostgREST URL: order ids of a buyer (005 user_id column). Pure. */
export function buildUserOrdersUrl(base: string, userId: string): string {
  return `${base}/rest/v1/orders?select=id&user_id=eq.${encodeURIComponent(userId)}&limit=100`;
}

/** PostgREST URL: does any of these orders contain the sku? Pure. */
export function buildOrderItemsCheckUrl(base: string, orderIds: string[], sku: string): string {
  const inList = orderIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  return `${base}/rest/v1/order_items?select=order_id&order_id=in.(${encodeURIComponent(inList)})&sku=eq.${encodeURIComponent(sku)}&limit=1`;
}

/**
 * Detect "005 not applied yet" from a PostgREST error (PGRST205 schema-cache
 * miss, 42P01 unknown relation). Pure — lets the handler answer 503 instead
 * of a generic 500 so the client degrades gracefully.
 */
export function isMissingTableError(status: number, body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const record = body as { code?: unknown; message?: unknown };
  if (record.code === 'PGRST205' || record.code === '42P01') return true;
  const message = typeof record.message === 'string' ? record.message : '';
  if (status === 404 && /could not find the table/i.test(message)) return true;
  return /relation "public\.reviews" does not exist/i.test(message);
}

/** Duplicate review (unique product_sku+user_id) from PostgREST. Pure. */
export function isDuplicateReviewError(status: number, body: unknown): boolean {
  if (status !== 409) return false;
  if (typeof body !== 'object' || body === null) return false;
  const record = body as { code?: unknown; message?: unknown };
  if (record.code === '23505') return true;
  const message = typeof record.message === 'string' ? record.message : '';
  return /duplicate key value/i.test(message);
}

// --- Server helpers ---

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

type Svc = { apikey: string; Authorization: string; Accept: string };

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Verify the user id via Supabase Auth admin getUser (never trust client alone). */
async function verifyUser(base: string, svc: Svc, userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: svc });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve the api/me role for a userId (verified via Auth admin getUser; untrusted ids => turista). */
async function fetchRoleByUserId(base: string, serviceKey: string, userId: string): Promise<string> {
  if (!UUID_RE.test(userId)) return 'turista';
  const svc: Svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' };
  try {
    const adminRes = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: svc });
    if (!adminRes.ok) return 'turista';
    const profRes = await fetch(`${base}/rest/v1/profiles?select=role,is_admin&id=eq.${encodeURIComponent(userId)}`, { headers: svc });
    if (!profRes.ok) return 'turista';
    const rows = (await profRes.json().catch(() => null)) as unknown;
    return pickRoleFromProfileRow(Array.isArray(rows) ? rows[0] : null);
  } catch {
    return 'turista';
  }
}

/** True when the user has a past order containing the sku (service_role, bypasses RLS). */
async function hasPurchasedSku(base: string, svc: Svc, userId: string, sku: string): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const ordersRes = await fetch(buildUserOrdersUrl(base, userId), { headers: svc }).catch(() => null);
    if (ordersRes === null || !ordersRes.ok) return 'unknown';
    const ordersBody = (await readJson(ordersRes)) as { id?: unknown }[] | null;
    const ids = (Array.isArray(ordersBody) ? ordersBody : [])
      .map((o) => (typeof o?.id === 'string' ? o.id : ''))
      .filter((id) => id !== '');
    if (ids.length === 0) return 'no';
    const itemsRes = await fetch(buildOrderItemsCheckUrl(base, ids, sku), { headers: svc }).catch(() => null);
    if (itemsRes === null || !itemsRes.ok) return 'unknown';
    const itemsBody = (await readJson(itemsRes)) as unknown;
    return Array.isArray(itemsBody) && itemsBody.length > 0 ? 'yes' : 'no';
  } catch {
    return 'unknown';
  }
}

// --- Handler ---

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end('');
    return;
  }
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH') {
    res.status(405).json({ error_es: 'Método no permitido' });
    return;
  }

  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url === '' || key === '') {
    res.status(500).json({ error_es: method === 'GET' ? 'No se pudieron cargar las opiniones' : 'No se pudo guardar tu opinión' });
    return;
  }
  const base = url.replace(/\/+$/, '');
  const svc: Svc = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };

  if (method === 'GET') {
    const status = readFirstQuery(req.query, 'status');
    if (status === 'pending' || status === 'rejected') {
      // Moderation queue (admin only, api/admin.ts style gate).
      const body = req.body ?? {};
      const adminEmail = (body['adminEmail'] ?? body['admin_email'] ?? readFirstQuery(req.query, 'adminEmail', 'admin_email')) as unknown;
      const userId = (body['userId'] ?? body['user_id'] ?? readFirstQuery(req.query, 'userId', 'user_id')) as unknown;
      let authed = isAdminEmail(adminEmail);
      if (!authed && typeof userId === 'string' && userId.trim() !== '') {
        authed = (await fetchRoleByUserId(base, key, userId.trim())) === 'admin';
      }
      if (!authed) {
        res.status(403).json({ error_es: 'No autorizado: solo administración' });
        return;
      }
      const skuFilter = readFirstQuery(req.query, 'sku');
      try {
        const r = await fetch(buildQueueReviewsUrl(base, status, skuFilter), { headers: svc });
        const data = await readJson(r);
        if (!r.ok) {
          if (isMissingTableError(r.status, data)) {
            res.status(503).json({ error_es: 'Las opiniones no están disponibles todavía' });
            return;
          }
          res.status(500).json({ error_es: 'No se pudieron cargar las opiniones' });
          return;
        }
        res.status(200).json({ reviews: toQueueReviews(data) });
      } catch {
        res.status(500).json({ error_es: 'No se pudieron cargar las opiniones' });
      }
      return;
    }
    // Public: approved reviews + average for a sku.
    const sku = readFirstQuery(req.query, 'sku');
    if (typeof sku !== 'string' || sku.trim() === '') {
      res.status(400).json({ error_es: 'SKU inválido' });
      return;
    }
    try {
      const r = await fetch(buildApprovedReviewsUrl(base, sku.trim()), { headers: svc });
      const data = await readJson(r);
      if (!r.ok) {
        if (isMissingTableError(r.status, data)) {
          res.status(503).json({ error_es: 'Las opiniones no están disponibles todavía' });
          return;
        }
        res.status(500).json({ error_es: 'No se pudieron cargar las opiniones' });
        return;
      }
      res.status(200).json(summarizeApprovedReviews(data));
    } catch {
      res.status(500).json({ error_es: 'No se pudieron cargar las opiniones' });
    }
    return;
  }

  if (method === 'POST') {
    const parsed = parseReviewBody(req.body);
    if (parsed.ok === false) {
      const code = parsed.errorEs.startsWith('Sesión') ? 401 : 400;
      res.status(code).json({ error_es: parsed.errorEs });
      return;
    }
    const { userId, sku, rating, comment } = parsed.value;
    if (!(await verifyUser(base, svc, userId))) {
      res.status(401).json({ error_es: 'Sesión no válida, inicia sesión de nuevo' });
      return;
    }
    try {
      // Product must exist (FK would reject anyway; this gives the Spanish 400).
      const prodRes = await fetch(`${base}/rest/v1/products?select=sku&sku=eq.${encodeURIComponent(sku)}&limit=1`, { headers: svc }).catch(() => null);
      if (prodRes === null) {
        res.status(500).json({ error_es: 'No se pudo guardar tu opinión' });
        return;
      }
      const prodBody = (await readJson(prodRes)) as unknown;
      if (!prodRes.ok) {
        if (isMissingTableError(prodRes.status, prodBody)) {
          res.status(503).json({ error_es: 'Las opiniones no están disponibles todavía' });
          return;
        }
        res.status(500).json({ error_es: 'No se pudo guardar tu opinión' });
        return;
      }
      if (!Array.isArray(prodBody) || prodBody.length === 0) {
        res.status(400).json({ error_es: 'Producto no encontrado' });
        return;
      }
      const purchase = await hasPurchasedSku(base, svc, userId, sku);
      if (purchase === 'no') {
        res.status(403).json({ error_es: 'Solo quienes compraron pueden opinar' });
        return;
      }
      if (purchase === 'unknown') {
        res.status(500).json({ error_es: 'No se pudo verificar tu compra, inténtalo más tarde' });
        return;
      }
      const ins = await fetch(`${base}/rest/v1/reviews`, {
        method: 'POST',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ product_sku: sku, user_id: userId, rating, comment, status: 'pending' }),
      }).catch(() => null);
      if (ins === null) {
        res.status(500).json({ error_es: 'No se pudo guardar tu opinión' });
        return;
      }
      const insBody = await readJson(ins);
      if (!ins.ok) {
        if (isMissingTableError(ins.status, insBody)) {
          res.status(503).json({ error_es: 'Las opiniones no están disponibles todavía' });
          return;
        }
        if (isDuplicateReviewError(ins.status, insBody)) {
          res.status(400).json({ error_es: 'Ya opinaste sobre este producto' });
          return;
        }
        res.status(500).json({ error_es: 'No se pudo guardar tu opinión' });
        return;
      }
      const row = (Array.isArray(insBody) ? insBody[0] : null) as { id?: unknown } | null;
      res.status(201).json({ id: typeof row?.id === 'string' ? row.id : null, status: 'pending' });
    } catch {
      res.status(500).json({ error_es: 'No se pudo guardar tu opinión' });
    }
    return;
  }

  // PATCH: moderation (admin only, api/admin.ts style gate).
  const body = req.body ?? {};
  const moderation = parseModerationBody(body);
  if (moderation.ok === false) {
    res.status(400).json({ error_es: moderation.errorEs });
    return;
  }
  let authed = isAdminEmail((body['adminEmail'] ?? body['admin_email']) as unknown);
  const modUserId = (body['userId'] ?? body['user_id']) as unknown;
  if (!authed && typeof modUserId === 'string' && modUserId.trim() !== '') {
    authed = (await fetchRoleByUserId(base, key, modUserId.trim())) === 'admin';
  }
  if (!authed) {
    res.status(403).json({ error_es: 'No autorizado: solo administración' });
    return;
  }
  try {
    const r = await fetch(`${base}/rest/v1/reviews?id=eq.${encodeURIComponent(moderation.value.reviewId)}`, {
      method: 'PATCH',
      headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: moderation.value.status }),
    }).catch(() => null);
    if (r === null) {
      res.status(500).json({ error_es: 'No se pudo moderar la opinión' });
      return;
    }
    const data = (await readJson(r)) as { id?: unknown; status?: unknown }[] | null;
    if (!r.ok) {
      if (isMissingTableError(r.status, data)) {
        res.status(503).json({ error_es: 'Las opiniones no están disponibles todavía' });
        return;
      }
      res.status(500).json({ error_es: 'No se pudo moderar la opinión' });
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      res.status(404).json({ error_es: 'Opinión no encontrada' });
      return;
    }
    res.status(200).json({ id: moderation.value.reviewId, status: moderation.value.status });
  } catch {
    res.status(500).json({ error_es: 'No se pudo moderar la opinión' });
  }
}
