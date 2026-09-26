// GET /api/products — public catalog read (PR1 foundation, mvp-completo).
// Stacked-to-main slice PR1: anon read-only. Writes go through service_role in later slices.
// Contract: 200 { products: CatalogProduct[] } | 500 { error_es: string }.
// Rollback: delete this file + revert .env.example commerce block; shop falls back to factories.ts.

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

  const supabaseUrl = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');

  if (supabaseUrl === '' || anonKey === '') {
    res.status(500).json({ error_es: 'No se pudo cargar el catálogo' });
    return;
  }

  const endpoint =
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/products` +
    `?select=sku,name_es,price_bob,stock,image_url&is_active=eq.true&order=name_es`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      res.status(500).json({ error_es: 'No se pudo cargar el catálogo' });
      return;
    }

    const rows = (await response.json()) as DbProductRow[];
    const products = Array.isArray(rows) ? rows.map(toCatalogProduct) : [];

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({ products });
  } catch {
    res.status(500).json({ error_es: 'No se pudo cargar el catálogo' });
  }
}
