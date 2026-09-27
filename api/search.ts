// GET /api/search?q= — public product search (M10, adapted stack: Supabase + Vercel serverless).
// Anon-safe: anon key, only is_active products, same CatalogProduct shape as /api/products.
// Client fallback: src/lib/catalog.ts searchCatalog() filters fetchCatalog() when this endpoint is down.
// Contract: 200 { products: CatalogProduct[] } | 500 { error_es }.
// Rollback: delete this file; searchCatalog() falls back to client-side filtering.

export const SEARCH_LIMIT = 20;
export const MAX_QUERY_LENGTH = 80;

type CatalogProduct = {
  sku: string;
  nameEs: string;
  priceBOB: number;
  stock: number;
  imageUrl: string | null;
};

type DbProductRow = {
  sku: string;
  name_es: string;
  price_bob: number | string;
  stock: number;
  image_url: string | null;
};

type VercelRequest = {
  method?: string;
  headers?: { origin?: string | string[] };
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  end: (body?: string) => void;
};

const ALLOWED_ORIGINS = ['https://chocolates-zeta.vercel.app', 'http://localhost:3000'];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.vercel\.app$/i.test(origin);
}

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const raw = req.headers?.origin;
  const origin = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  if (origin !== '' && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getEnv(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function toCatalogProduct(row: DbProductRow): CatalogProduct {
  return {
    sku: row.sku,
    nameEs: row.name_es,
    priceBOB: typeof row.price_bob === 'string' ? Number(row.price_bob) : row.price_bob,
    stock: row.stock,
    imageUrl: row.image_url,
  };
}

// --- Pure logic (covered by src/lib/search.test.ts) ---

/** Trim + cap the raw query. Pure. */
export function parseSearchQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_QUERY_LENGTH);
}

/** Strip chars that would break the PostgREST or=(...) filter or act as wildcards. Pure. */
export function sanitizeLikeTerm(q: string): string {
  return q.replace(/[*(),%\\]/g, '').replace(/\s+/g, ' ').trim();
}

export function readQueryQ(query: VercelRequest['query']): unknown {
  if (!query) return undefined;
  const raw = query['q'];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Build the anon-safe PostgREST URL: active products, ilike on name_es/sku, capped. Pure. */
export function buildSearchEndpoint(base: string, term: string): string {
  const like = encodeURIComponent(`*${term}*`);
  return (
    `${base}/rest/v1/products` +
    `?select=sku,name_es,price_bob,stock,image_url&is_active=eq.true` +
    `&or=(name_es.ilike.${like},sku.ilike.${like})&order=name_es&limit=${SEARCH_LIMIT}`
  );
}

// --- Handler ---

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end('');
    return;
  }

  if (req.method !== undefined && req.method !== 'GET') {
    res.status(405).json({ error_es: 'Método no permitido' });
    return;
  }

  const term = sanitizeLikeTerm(parseSearchQuery(readQueryQ(req.query)));
  if (term === '') {
    res.status(200).json({ products: [] });
    return;
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');

  if (supabaseUrl === '' || anonKey === '') {
    res.status(500).json({ error_es: 'No se pudo buscar en el catálogo' });
    return;
  }

  const endpoint = buildSearchEndpoint(supabaseUrl.replace(/\/+$/, ''), term);

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      res.status(500).json({ error_es: 'No se pudo buscar en el catálogo' });
      return;
    }

    const rows = (await response.json()) as DbProductRow[];
    const products = Array.isArray(rows) ? rows.map(toCatalogProduct) : [];

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ products });
  } catch {
    res.status(500).json({ error_es: 'No se pudo buscar en el catálogo' });
  }
}
