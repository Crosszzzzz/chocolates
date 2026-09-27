// POST /api/checkout — mock checkout calling reserve_order RPC (PR4, mvp-completo).
// Stacked-to-main slice PR4: server recomputes total via RPC, rejects tampered totals.
// Contract: 200 { orderId, totalBOB } | 400/409/500 { error_es }.
// Rollback: delete this file; cart + catalog keep working without checkout.
type Line = { sku: string; qty: number };
type VercelReq = { method?: string; headers?: { origin?: string | string[] }; body?: { lines?: Line[]; fulfillment?: string; address?: string; clientTotalBOB?: number; userId?: unknown; user_id?: unknown } };
type VercelRes = { setHeader: (n: string, v: string) => void; status: (c: number) => VercelRes; json: (b: unknown) => void; end: (b?: string) => void };
function env(n: string): string { const v = process.env[n]; return typeof v === 'string' ? v.trim() : '' }
const ALLOWED_ORIGINS = ['https://chocolates-zeta.vercel.app', 'http://localhost:3000'];
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.vercel\.app$/i.test(origin);
}
// Delivery zone = Sucre city, implied by the fulfillment mode itself;
// the street field only needs a plausible street + number (>= 6 chars).
export function isDeliveryAddressValid(addr: string): boolean {
  return addr.trim().length >= 6;
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
export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(''); return }
  if (req.method !== undefined && req.method !== 'POST') { res.status(405).json({ error_es: 'Método no permitido' }); return }
  const { lines, fulfillment, address, clientTotalBOB } = req.body ?? {};
  if (!Array.isArray(lines) || lines.length === 0) { res.status(400).json({ error_es: 'Carrito vacío' }); return }
  for (const l of lines) {
    if (typeof l?.sku !== 'string' || l.sku.trim() === '' || !Number.isInteger(l?.qty) || (l?.qty ?? 0) <= 0) {
      res.status(400).json({ error_es: `Cantidad inválida para SKU ${String(l?.sku ?? '')}` }); return;
    }
  }
  if (fulfillment !== 'pickup' && fulfillment !== 'delivery-sucre') { res.status(400).json({ error_es: 'Modalidad de entrega no válida (solo pickup o delivery-sucre)' }); return }
  const addr = typeof address === 'string' ? address.trim() : '';
  if (fulfillment === 'delivery-sucre' && addr === '') { res.status(400).json({ error_es: 'Dirección requerida para delivery en Sucre' }); return }
  if (fulfillment === 'delivery-sucre' && !isDeliveryAddressValid(addr)) { res.status(400).json({ error_es: 'Escribe tu calle y número para el delivery en Sucre' }); return }
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo procesar el pedido' }); return }
  // Pre-validate client total BEFORE reserving stock (tamper-guard ordering fix).
  // RPC recomputes total server-side, but calling it first would reserve stock
  // even when the client total was tampered. Fetch prices, compare, then RPC.
  // Post-RPC check below stays as defense-in-depth for price races.
  if (typeof clientTotalBOB === 'number' && Number.isFinite(clientTotalBOB)) {
    try {
      const skus = [...new Set(lines.map((l) => l.sku.trim()))];
      const inList = skus.map((s) => `"${s.replace(/"/g, '')}"`).join(',');
      const priceRes = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/products?select=sku,price_bob,is_active&sku=in.(${encodeURIComponent(inList)})`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      });
      if (priceRes.ok) {
        const rows = (await priceRes.json().catch(() => null)) as { sku?: string; price_bob?: number | string; is_active?: boolean }[] | null;
        if (Array.isArray(rows)) {
          const priceBySku = new Map<string, number>();
          for (const r of rows) {
            if (typeof r?.sku !== 'string' || r?.is_active === false) continue;
            const p = typeof r?.price_bob === 'string' ? Number(r.price_bob) : r?.price_bob;
            if (typeof p === 'number' && Number.isFinite(p)) priceBySku.set(r.sku, p);
          }
          let expected: number | null = null;
          if (skus.every((s) => priceBySku.has(s))) {
            expected = 0;
            for (const l of lines) expected += (priceBySku.get(l.sku.trim()) as number) * l.qty;
          }
          if (expected !== null && Math.abs(clientTotalBOB - expected) > 0.01) {
            res.status(400).json({ error_es: 'Total no coincide, inténtalo de nuevo' }); return;
          }
        }
      }
    } catch { /* price pre-check is best-effort; RPC remains authoritative */ }
  }
  try {
    const rpc = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/reserve_order`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_items: lines, p_fulfillment: fulfillment, p_address: addr === '' ? null : addr }),
    });
    const data = (await rpc.json().catch(() => null)) as { order_id?: string; total?: number | string }[] | { message?: string } | null;
    if (!rpc.ok) {
      const msg = typeof (data as { message?: string } | null)?.message === 'string' ? (data as { message?: string }).message as string : 'No se pudo procesar el pedido';
      const code = /sin stock/i.test(msg) ? 409 : 400;
      res.status(code).json({ error_es: msg }); return;
    }
    const row = Array.isArray(data) ? data[0] : null;
    const total = typeof row?.total === 'string' ? Number(row.total) : (row?.total ?? NaN);
    if (row?.order_id == null || !Number.isFinite(total)) { res.status(500).json({ error_es: 'No se pudo procesar el pedido' }); return }
    if (typeof clientTotalBOB === 'number' && Math.abs(clientTotalBOB - (total as number)) > 0.01) {
      res.status(400).json({ error_es: 'Total no coincide, inténtalo de nuevo' }); return;
    }
    // M14: attach the buyer to the order best-effort (005 user_id column) so
    // api/reviews.ts can verify past purchases. Verified via Auth admin getUser;
    // unverified ids are ignored and a missing column (005 not applied yet)
    // never breaks checkout.
    const rawUserId = req.body?.userId ?? req.body?.user_id;
    const buyerId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
    if (buyerId !== '') {
      try {
        const check = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/admin/users/${encodeURIComponent(buyerId)}`, {
          headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
        });
        if (check.ok) {
          await fetch(`${url.replace(/\/+$/, '')}/rest/v1/orders?id=eq.${encodeURIComponent(String(row.order_id))}`, {
            method: 'PATCH',
            headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: buyerId }),
          }).catch(() => null);
        }
      } catch { /* buyer attach is best-effort; the order itself succeeded */ }
    }
    res.status(200).json({ orderId: row.order_id, totalBOB: total });
  } catch { res.status(500).json({ error_es: 'No se pudo procesar el pedido' }) }
}
