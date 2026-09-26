// POST /api/checkout — mock checkout calling reserve_order RPC (PR4, mvp-completo).
// Stacked-to-main slice PR4: server recomputes total via RPC, rejects tampered totals.
// Contract: 200 { orderId, totalBOB } | 400/409/500 { error_es }.
// Rollback: delete this file; cart + catalog keep working without checkout.
type Line = { sku: string; qty: number };
type VercelReq = { method?: string; headers?: { origin?: string | string[] }; body?: { lines?: Line[]; fulfillment?: string; address?: string; clientTotalBOB?: number } };
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
  if (fulfillment === 'delivery-sucre' && !/sucre/i.test(addr)) { res.status(400).json({ error_es: 'Solo entregamos en Sucre' }); return }
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url === '' || key === '') { res.status(500).json({ error_es: 'No se pudo procesar el pedido' }); return }
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
    res.status(200).json({ orderId: row.order_id, totalBOB: total });
  } catch { res.status(500).json({ error_es: 'No se pudo procesar el pedido' }) }
}
