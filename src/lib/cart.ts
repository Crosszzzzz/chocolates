// Pure cart logic shared by the client (CartContext) and the server (api/cart).
// This module is client-safe: no Node/Vercel dependencies, no secrets, no fetch.
// Home of the pure helpers so browser bundles never import from api/* (under
// `vercel dev`, /api/* URLs are routed to serverless functions, which breaks
// ES module loading and leaves #root empty).

export interface CartLine {
  sku: string;
  qty: number;
}

export interface ProductStockRow {
  sku: string;
  stock: number;
  is_active: boolean;
}

export const MAX_CART_LINES = 50;
export const CARTS_TABLE_MISSING = 'CARTS_TABLE_MISSING';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a user id. Pure: returns the trimmed id or a Spanish error. */
export function parseCartUserId(value: unknown): { ok: true; userId: string } | { ok: false; errorEs: string } {
  if (typeof value !== 'string' || value.trim() === '' || !UUID_RE.test(value.trim())) {
    return { ok: false, errorEs: 'Sesión no válida, inicia sesión de nuevo' };
  }
  return { ok: true, userId: value.trim() };
}

export type CartQuery = Record<string, string | string[] | undefined> | undefined;

/** Read userId from the query string (?userId= / ?user_id=, first value wins). Pure. */
export function readQueryUserId(query: CartQuery): unknown {
  if (!query) return undefined;
  const raw = query['userId'] ?? query['user_id'];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Validate a PUT payload's lines. Shape errors are hard 400s (Spanish);
 * stock/is_active clamping happens later in clampCartLines (soft warnings).
 * Duplicate SKUs are merged by summing (documented). Empty array is valid (clear).
 * Pure.
 */
export function parseCartLines(value: unknown): { ok: true; lines: CartLine[] } | { ok: false; errorEs: string } {
  if (!Array.isArray(value)) return { ok: false, errorEs: 'Carrito inválido' };
  if (value.length > MAX_CART_LINES) return { ok: false, errorEs: 'El carrito tiene demasiados productos' };
  const bySku = new Map<string, number>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return { ok: false, errorEs: 'Carrito inválido' };
    const skuRaw = (item as { sku?: unknown }).sku;
    const qty = (item as { qty?: unknown }).qty;
    const sku = typeof skuRaw === 'string' ? skuRaw.trim() : '';
    if (sku === '') return { ok: false, errorEs: 'Carrito inválido' };
    if (!Number.isInteger(qty) || (qty as number) <= 0) {
      return { ok: false, errorEs: `Cantidad inválida para SKU ${sku}` };
    }
    bySku.set(sku, (bySku.get(sku) ?? 0) + (qty as number));
  }
  return { ok: true, lines: [...bySku].map(([sku, qty]) => ({ sku, qty })) };
}

/**
 * Merge server + local carts. SERVER WINS on conflict (same SKU takes the
 * server qty); local-only SKUs are appended in local order. Simple + documented
 * (no timestamp/CRDT tracking at this scale). Pure.
 */
export function mergeCarts(serverLines: CartLine[], localLines: CartLine[]): CartLine[] {
  const serverSkus = new Set(serverLines.map((l) => l.sku));
  const localOnly = localLines.filter((l) => l.qty > 0 && !serverSkus.has(l.sku));
  return [...serverLines.filter((l) => l.qty > 0), ...localOnly];
}

/**
 * Add one unit of a SKU to the cart, respecting stock. New SKUs start at qty 1;
 * over-stock adds are rejected (line unchanged). Returns the next lines plus a
 * Spanish warning (null on success). Pure — shared by the add-to-cart button
 * flow through CartContext.add.
 */
export function addLineToCart(
  lines: CartLine[],
  sku: string,
  stock: number,
): { lines: CartLine[]; warning: string | null } {
  if (stock <= 0) return { lines, warning: 'Sin stock' };
  const found = lines.find((l) => l.sku === sku);
  if (!found) return { lines: [...lines, { sku, qty: 1 }], warning: null };
  if (found.qty >= stock) return { lines, warning: `Solo quedan ${stock} unidades` };
  return { lines: lines.map((l) => (l.sku === sku ? { ...l, qty: l.qty + 1 } : l)), warning: null };
}

/**
 * Clamp lines against live product rows. Unknown/inactive SKUs and zero-stock
 * lines are dropped; over-stock qty is clamped. Every adjustment yields a
 * Spanish warning for the response. Pure.
 */
export function clampCartLines(
  lines: CartLine[],
  products: ProductStockRow[],
): { lines: CartLine[]; warnings: string[] } {
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const out: CartLine[] = [];
  const warnings: string[] = [];
  for (const line of lines) {
    const product = bySku.get(line.sku);
    if (!product) {
      warnings.push(`Producto no encontrado: ${line.sku}`);
      continue;
    }
    if (product.is_active === false) {
      warnings.push(`Producto no disponible: ${line.sku}`);
      continue;
    }
    if (product.stock <= 0) {
      warnings.push(`Sin stock de ${line.sku}`);
      continue;
    }
    if (line.qty > product.stock) {
      warnings.push(`Solo quedan ${product.stock} unidades de ${line.sku}`);
      out.push({ sku: line.sku, qty: product.stock });
      continue;
    }
    out.push({ sku: line.sku, qty: line.qty });
  }
  return { lines: out, warnings };
}

/**
 * Detect "004 not applied yet" from a PostgREST/Supabase error (PGRST205
 * schema-cache miss, 42P01 unknown relation). Pure — lets the handler answer
 * 503 with CARTS_TABLE_MISSING instead of a generic 500.
 */
export function isMissingTableError(status: number, body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const record = body as { code?: unknown; message?: unknown };
  if (record.code === 'PGRST205' || record.code === '42P01') return true;
  const message = typeof record.message === 'string' ? record.message : '';
  if (status === 404 && /could not find the table/i.test(message)) return true;
  return /relation "public\.carts?" does not exist|relation "public\.cart_items" does not exist/i.test(message);
}

/** PostgREST URL: find the user's cart row. Pure. */
export function buildCartLookupUrl(base: string, userId: string): string {
  return `${base}/rest/v1/carts?select=id&user_id=eq.${encodeURIComponent(userId)}`;
}

/** PostgREST URL: live stock/is_active for the given SKUs (001 columns only). Pure. */
export function buildProductsStockUrl(base: string, skus: string[]): string {
  const inList = skus.map((s) => `"${s.replace(/"/g, '')}"`).join(',');
  return `${base}/rest/v1/products?select=sku,stock,is_active&sku=in.(${encodeURIComponent(inList)})`;
}
