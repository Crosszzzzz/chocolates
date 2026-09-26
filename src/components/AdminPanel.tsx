import React, { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
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
export const AdminPanel: React.FC<{ catalog: CatalogMap }> = ({ catalog }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { price: string; stock: string }>>({});
  const [errorEs, setErrorEs] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  if (user === null || !isAdminEmail(user.email)) return null;
  const skus = Object.keys(catalog);
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
        body: JSON.stringify({ adminEmail: user?.email, sku, priceBOB, stock }) });
      const data = (await res.json()) as { error_es?: string };
      if (!res.ok) { setErrorEs(data.error_es ?? 'No se pudo guardar el cambio'); return }
      setOkMsg(`Guardado ${sku}. Recarga la tienda para ver el cambio.`);
    } catch { setErrorEs('No se pudo guardar el cambio') } finally { setSaving(null) }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Abrir administración"
        className="fixed bottom-4 right-4 z-[65] min-h-[44px] px-4 flex items-center gap-2 rounded-xl bg-[#2b170e] text-[#e5c158] border border-[#d4af37]/30 text-xs font-bold cursor-pointer">
        <ShieldCheck className="w-4 h-4" /><span>Administrar</span>
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Administración del catálogo">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative w-full sm:max-w-lg bg-[#1c100a] border border-[#d4af37]/30 rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#fcf8f2]">Administración</h2>
          <button onClick={() => setOpen(false)} aria-label="Cerrar administración" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#2b170e] text-[#e5c158] border border-[#d4af37]/25 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-[#bda393] mb-3">Precios en BOB y stock. Solo delivery en Sucre (validado en compra).</p>
        {errorEs !== null && <p role="alert" className="text-xs text-[#f0a6a6] mb-2">{errorEs}</p>}
        {okMsg !== null && <p role="status" className="text-xs text-[#a8e6a3] mb-2">{okMsg}</p>}
        <ul className="flex flex-col gap-2">
          {skus.map((sku) => {
            const item = catalog[sku];
            return (
              <li key={sku} className="flex items-center gap-2 p-2 rounded-xl bg-[#25130b] border border-[#d4af37]/20">
                <img src="/images/placeholder.svg" alt={`Foto provisional de ${item.nameEs}`} loading="lazy" className="w-10 h-10 rounded-lg shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#fcf8f2] truncate">{item.nameEs}</p>
                  <div className="flex gap-1.5 mt-1">
                    <input value={drafts[sku]?.price ?? String(item.priceBOB)} onChange={(e) => setDrafts((d) => ({ ...d, [sku]: { price: e.target.value, stock: drafts[sku]?.stock ?? String(item.stock) } }))} aria-label={`Precio en BOB para ${item.nameEs}`} inputMode="decimal" className="w-20 min-h-[44px] rounded-lg bg-[#120a06] border border-[#d4af37]/20 px-2 text-xs text-[#fcf8f2]" />
                    <input value={drafts[sku]?.stock ?? String(item.stock)} onChange={(e) => setDrafts((d) => ({ ...d, [sku]: { price: drafts[sku]?.price ?? String(item.priceBOB), stock: e.target.value } }))} aria-label={`Stock para ${item.nameEs}`} inputMode="numeric" className="w-16 min-h-[44px] rounded-lg bg-[#120a06] border border-[#d4af37]/20 px-2 text-xs text-[#fcf8f2]" />
                  </div>
                </div>
                <button onClick={() => void save(sku)} disabled={saving === sku} aria-label={`Guardar ${item.nameEs}`} className="min-h-[44px] px-3 rounded-xl bg-[#d4af37] text-[#1a0f08] text-xs font-bold disabled:opacity-60 cursor-pointer">{saving === sku ? 'Guardando…' : 'Guardar'}</button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
