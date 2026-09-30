import React, { useEffect, useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FACTORIES } from '../data/factories';
import { PRODUCT_ASSETS } from '../data/productAssets';
import type { CatalogMap } from './CartDrawer';
// Admin catalog panel (PR5, mvp-completo). Overlay-only, visual-no-op 3D.
// Gate MVP: VITE_ADMIN_EMAILS allow-list. Future: profiles.is_admin flag.
// Photos MVP: /public placeholders with ES alt. Supabase Storage deferred.
function adminList(): string[] {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ADMIN_EMAILS;
  return typeof v === 'string' ? v.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '') : [];
}
export function isAdminEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && adminList().includes(email.trim().toLowerCase());
}
type DashboardKpis = { totalOrders: number; revenueBOB: number; activeProducts: number; outOfStock: number; lowStock: { sku: string; nameEs: string; stock: number }[] };
type DashboardOrder = { id: string; total_bob: number; fulfillment: string; status: string; created_at: string; itemCount: number };
type DashboardPayload = { kpis: DashboardKpis; recentOrders: DashboardOrder[]; topProducts: { sku: string; qty: number }[] };
type QueueReview = { id: string; sku: string; userId: string; rating: number; comment: string; status: string; createdAt: string };
function modalidadEs(v: string): string { return v === 'delivery-sucre' ? 'Delivery' : v === 'pickup' ? 'Recojo' : v }
function estadoEs(v: string): string { return v === 'reserved' ? 'Reservado' : v === 'cancelled' ? 'Cancelado' : v }
export const AdminPanel: React.FC<{ catalog: CatalogMap }> = ({ catalog }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { price: string; stock: string }>>({});
  const [errorEs, setErrorEs] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  // M14 moderation queue (pending reviews from api/reviews.ts).
  const [queue, setQueue] = useState<QueueReview[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);
  async function loadStats(): Promise<void> {
    const email = user?.email ?? '';
    const uid = user?.id ?? '';
    if (!isAdminEmail(email)) return;
    setStatsLoading(true); setStatsError(null);
    try {
      const q = new URLSearchParams({ adminEmail: email, userId: uid });
      const res = await fetch(`/api/admin-stats?${q.toString()}`);
      const data = (await res.json()) as DashboardPayload & { error_es?: string };
      if (!res.ok) { setStatsError(data.error_es ?? 'No se pudo cargar el panel'); return }
      setStats(data);
    } catch { setStatsError('No se pudo cargar el panel') } finally { setStatsLoading(false) }
  }
  async function loadQueue(): Promise<void> {
    const email = user?.email ?? '';
    const uid = user?.id ?? '';
    if (!isAdminEmail(email)) return;
    setQueueLoading(true); setQueueError(null);
    try {
      const q = new URLSearchParams({ status: 'pending', adminEmail: email, userId: uid });
      const res = await fetch(`/api/reviews?${q.toString()}`);
      if (res.status === 503) { setQueue([]); return } // 005 not applied yet.
      const data = (await res.json()) as { reviews?: QueueReview[]; error_es?: string };
      if (!res.ok || !Array.isArray(data.reviews)) { setQueueError(data.error_es ?? 'No se pudieron cargar las reseñas'); return }
      setQueue(data.reviews);
    } catch { setQueueError('No se pudieron cargar las reseñas') } finally { setQueueLoading(false) }
  }
  async function moderate(reviewId: string, status: 'approved' | 'rejected'): Promise<void> {
    setModerating(reviewId); setErrorEs(null);
    try {
      const res = await fetch('/api/reviews', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user?.email, userId: user?.id, reviewId, status }) });
      const data = (await res.json().catch(() => null)) as { error_es?: string } | null;
      if (!res.ok) { setErrorEs(data?.error_es ?? 'No se pudo moderar la opinión'); return }
      setQueue((q) => q.filter((r) => r.id !== reviewId));
      setOkMsg(status === 'approved' ? 'Opinión aprobada.' : 'Opinión rechazada.');
    } catch { setErrorEs('No se pudo moderar la opinión') } finally { setModerating(null) }
  }
  useEffect(() => { if (open) { void loadStats(); void loadQueue(); } }, [open]);
  if (user === null || !isAdminEmail(user.email)) return null;
  async function save(sku: string): Promise<void> {
    const item = catalog[sku]; if (!item) return;
    const priceRaw = drafts[sku]?.price ?? String(item.priceBOB);
    const stockRaw = drafts[sku]?.stock ?? String(item.stock);
    const priceBOB = Number(priceRaw); const stock = Number(stockRaw);
    if (!Number.isFinite(priceBOB) || priceBOB <= 0) { setErrorEs('Precio inválido (debe ser mayor a 0)'); return }
    if (!Number.isInteger(stock) || stock < 0) { setErrorEs('Stock inválido (debe ser 0 o mayor)'); return }
    setSaving(sku); setErrorEs(null); setOkMsg(null);
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user?.email, userId: user?.id, sku, priceBOB, stock }) });
      const data = (await res.json()) as { error_es?: string };
      if (!res.ok) { setErrorEs(data.error_es ?? 'No se pudo guardar el cambio'); return }
      setOkMsg(`Guardado ${sku}. Recarga la tienda para ver el cambio.`);
    } catch { setErrorEs('No se pudo guardar el cambio') } finally { setSaving(null) }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Abrir administración"
        className="fixed z-40 top-[max(5rem,calc(env(safe-area-inset-top)+4.5rem))] right-3 sm:right-4 min-h-[44px] px-4 flex items-center gap-2 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/30 text-xs font-bold cursor-pointer">
        <ShieldCheck className="w-4 h-4" /><span>Administrar</span>
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Administración del catálogo">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative w-full sm:max-w-lg bg-[#fffdf8] dark:bg-[#1c100a] border border-[#d4af37]/30 rounded-t-2xl sm:rounded-2xl p-5 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">Administración</h2>
          <button onClick={() => setOpen(false)} aria-label="Cerrar administración" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-[#7a5c48] dark:text-[#bda393] mb-3">Precios en BOB y stock. Solo delivery en Sucre (validado en compra).</p>
        <div className="mb-3 rounded-xl bg-[#ffffff] dark:bg-[#25130b] border border-[#d4af37]/20 p-3" aria-label="Resumen de ventas">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2]">Resumen</h3>
            <button onClick={() => void loadStats()} aria-label="Actualizar panel" className="min-h-[44px] px-3 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 text-xs font-bold cursor-pointer">Actualizar</button>
          </div>
          {statsLoading && <p role="status" className="text-xs text-[#7a5c48] dark:text-[#bda393] mb-2">Cargando panel…</p>}
          {statsError !== null && <p role="alert" className="text-xs text-[#b3261e] dark:text-[#f0a6a6] mb-2">{statsError}</p>}
          {stats !== null && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="p-2 rounded-xl bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/15">
                  <p className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Pedidos</p>
                  <p className="text-base font-extrabold text-[#2b1a12] dark:text-[#fcf8f2]" aria-label={`${stats.kpis.totalOrders} pedidos`}>{stats.kpis.totalOrders}</p>
                </div>
                <div className="p-2 rounded-xl bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/15">
                  <p className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Ingresos Bs</p>
                  <p className="text-base font-extrabold text-[#8a6216] dark:text-[#f1c40f]" aria-label={`Ingresos ${stats.kpis.revenueBOB} bolivianos`}>Bs {stats.kpis.revenueBOB.toFixed(2)}</p>
                </div>
                <div className="p-2 rounded-xl bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/15">
                  <p className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Productos activos</p>
                  <p className="text-base font-extrabold text-[#2b1a12] dark:text-[#fcf8f2]">{stats.kpis.activeProducts}</p>
                </div>
                <div className="p-2 rounded-xl bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/15">
                  <p className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Sin stock</p>
                  <p className="text-base font-extrabold text-[#b3261e] dark:text-[#f0a6a6]">{stats.kpis.outOfStock}</p>
                </div>
              </div>
              <h4 className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2] mb-1">Pedidos recientes</h4>
              {stats.recentOrders.length === 0 ? (
                <p className="text-xs text-[#7a5c48] dark:text-[#bda393] mb-2">Sin pedidos todavía.</p>
              ) : (
                <div className="overflow-x-auto mb-2">
                  <table className="w-full text-[11px] text-[#2b1a12] dark:text-[#fcf8f2]">
                    <thead>
                      <tr className="text-left text-[#7a5c48] dark:text-[#bda393]">
                        <th className="py-1 pr-2 font-bold">Pedido</th>
                        <th className="py-1 pr-2 font-bold">Total</th>
                        <th className="py-1 pr-2 font-bold">Artículos</th>
                        <th className="py-1 pr-2 font-bold">Modalidad</th>
                        <th className="py-1 pr-2 font-bold">Estado</th>
                        <th className="py-1 font-bold">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentOrders.map((o) => (
                        <tr key={o.id} className="border-t border-[#d4af37]/10">
                          <td className="py-1 pr-2" title={o.id}>{o.id.slice(0, 8)}</td>
                          <td className="py-1 pr-2">Bs {Number(o.total_bob).toFixed(2)}</td>
                          <td className="py-1 pr-2">{o.itemCount}</td>
                          <td className="py-1 pr-2">{modalidadEs(o.fulfillment)}</td>
                          <td className="py-1 pr-2">{estadoEs(o.status)}</td>
                          <td className="py-1">{o.created_at !== '' ? new Date(o.created_at).toLocaleDateString('es-BO') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h4 className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2] mb-1">Alertas de stock</h4>
              {stats.kpis.lowStock.length === 0 ? (
                <p className="text-xs text-[#7a5c48] dark:text-[#bda393]">Stock sin alertas.</p>
              ) : (
                <ul className="flex flex-col gap-1" aria-label="Alertas de stock bajo">
                  {stats.kpis.lowStock.map((p) => (
                    <li key={p.sku} className="text-[11px] text-[#8a6216] dark:text-[#e8c97a]">
                      {p.nameEs} — {p.stock <= 0 ? 'sin stock' : `quedan ${p.stock}`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="mb-3 rounded-xl bg-[#ffffff] dark:bg-[#25130b] border border-[#d4af37]/20 p-3" aria-label="Reseñas pendientes">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2]">Reseñas {queue.length > 0 && <span className="text-[#8a6216] dark:text-[#e5c158]">({queue.length})</span>}</h3>
            <button onClick={() => void loadQueue()} aria-label="Actualizar reseñas" className="min-h-[44px] px-3 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 text-xs font-bold cursor-pointer">Actualizar</button>
          </div>
          {queueLoading && <p role="status" className="text-xs text-[#7a5c48] dark:text-[#bda393] mb-2">Cargando reseñas…</p>}
          {queueError !== null && <p role="alert" className="text-xs text-[#b3261e] dark:text-[#f0a6a6] mb-2">{queueError}</p>}
          {!queueLoading && queueError === null && queue.length === 0 && (
            <p className="text-xs text-[#7a5c48] dark:text-[#bda393]">Sin reseñas pendientes.</p>
          )}
          {queue.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Lista de reseñas pendientes">
              {queue.map((r) => (
                <li key={r.id} className="p-2 rounded-xl bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/15">
                  <p className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">{r.sku} · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
                  {r.comment !== '' && <p className="text-xs text-[#2b1a12] dark:text-[#fcf8f2] mt-1 leading-relaxed">{r.comment}</p>}
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => void moderate(r.id, 'approved')} disabled={moderating === r.id} aria-label={`Aprobar reseña de ${r.sku}`} className="min-h-[44px] px-3 rounded-xl bg-[#d4af37] text-[#1a0f08] text-xs font-bold disabled:opacity-60 cursor-pointer">
                      {moderating === r.id ? 'Guardando…' : 'Aprobar'}
                    </button>
                    <button onClick={() => void moderate(r.id, 'rejected')} disabled={moderating === r.id} aria-label={`Rechazar reseña de ${r.sku}`} className="min-h-[44px] px-3 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#b3261e] dark:text-[#f0a6a6] border border-[#b3261e]/30 dark:border-[#f0a6a6]/30 text-xs font-bold disabled:opacity-60 cursor-pointer">
                      Rechazar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {errorEs !== null && <p role="alert" className="text-xs text-[#b3261e] dark:text-[#f0a6a6] mb-2">{errorEs}</p>}
        {okMsg !== null && <p role="status" className="text-xs text-[#1e7e34] dark:text-[#a8e6a3] mb-2">{okMsg}</p>}
        <ul className="flex flex-col gap-3">
          {FACTORIES.map((factory) => {
            const items = factory.products.filter((p) => catalog[p.id] !== undefined);
            if (items.length === 0) return null;
            return (
              <li key={factory.id} className="flex flex-col gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#8a6216] dark:text-[#e5c158]">{factory.name}</h3>
                <ul className="flex flex-col gap-2">
                  {items.map((p) => {
                    const sku = p.id;
                    const item = catalog[sku];
                    const photo = PRODUCT_ASSETS[sku]?.photo ?? '/images/placeholder.svg';
                    return (
                      <li key={sku} className="flex items-center gap-2 p-2 rounded-xl bg-[#ffffff] dark:bg-[#25130b] border border-[#d4af37]/20">
                        <img src={photo} alt={`Foto de ${item.nameEs}`} loading="lazy" className="w-10 h-10 rounded-lg shrink-0 object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2] truncate">{item.nameEs}</p>
                          <div className="flex gap-1.5 mt-1">
                            <input value={drafts[sku]?.price ?? String(item.priceBOB)} onChange={(e) => setDrafts((d) => ({ ...d, [sku]: { price: e.target.value, stock: drafts[sku]?.stock ?? String(item.stock) } }))} aria-label={`Precio en BOB para ${item.nameEs}`} inputMode="decimal" className="w-20 min-h-[44px] rounded-lg bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/20 px-2 text-xs text-[#2b1a12] dark:text-[#fcf8f2]" />
                            <input value={drafts[sku]?.stock ?? String(item.stock)} onChange={(e) => setDrafts((d) => ({ ...d, [sku]: { price: drafts[sku]?.price ?? String(item.priceBOB), stock: e.target.value } }))} aria-label={`Stock para ${item.nameEs}`} inputMode="numeric" className="w-16 min-h-[44px] rounded-lg bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/20 px-2 text-xs text-[#2b1a12] dark:text-[#fcf8f2]" />
                          </div>
                        </div>
                        <button onClick={() => void save(sku)} disabled={saving === sku} aria-label={`Guardar ${item.nameEs}`} className="min-h-[44px] px-3 rounded-xl bg-[#d4af37] text-[#1a0f08] text-xs font-bold disabled:opacity-60 cursor-pointer">{saving === sku ? 'Guardando…' : 'Guardar'}</button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
