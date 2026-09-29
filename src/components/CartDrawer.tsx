import React, { useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
export type CatalogMap = Record<string, { nameEs: string; priceBOB: number; stock: number }>;
interface Props { open: boolean; catalog: CatalogMap; onClose: () => void; onCheckout: () => void }
export const CartDrawer: React.FC<Props> = ({ open, catalog, onClose, onCheckout }) => {
  const { lines, setQty, remove } = useCart();
  const total = useMemo(() => lines.reduce((n, l) => n + (catalog[l.sku]?.priceBOB ?? 0) * l.qty, 0), [lines, catalog]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Carrito">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#fffdf8] dark:bg-[#1c100a] border border-[#d4af37]/30 rounded-t-2xl sm:rounded-2xl p-5 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">Carrito</h2>
          <button onClick={onClose} aria-label="Cerrar carrito" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-[#5c4433] dark:text-[#d7c4b7]">Tu carrito está vacío.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((l) => {
              const item = catalog[l.sku];
              return (
                <li key={l.sku} className="flex items-center gap-2 p-2 rounded-xl bg-[#ffffff] dark:bg-[#25130b] border border-[#d4af37]/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2] truncate">{item?.nameEs ?? l.sku}</p>
                    <p className="text-[11px] text-[#8a6216] dark:text-[#e5c158]">Bs {(item?.priceBOB ?? 0).toFixed(2)}</p>
                  </div>
                  <button onClick={() => setQty(l.sku, l.qty - 1, item?.stock ?? 99)} aria-label="Quitar uno" className="min-w-[44px] min-h-[44px] rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 cursor-pointer">−</button>
                  <span className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2] w-6 text-center">{l.qty}</span>
                  <button onClick={() => setQty(l.sku, l.qty + 1, item?.stock ?? 99)} aria-label="Añadir uno" className="min-w-[44px] min-h-[44px] rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 cursor-pointer">+</button>
                  <button onClick={() => remove(l.sku)} aria-label="Quitar del carrito" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#b3261e] dark:text-[#f0a6a6] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 pt-3 border-t border-[#d4af37]/20 flex items-center justify-between">
          <span className="text-xs text-[#7a5c48] dark:text-[#bda393]">Total</span>
          <span className="text-sm font-extrabold text-[#8a6216] dark:text-[#f1c40f]">Bs {total.toFixed(2)}</span>
        </div>
        {lines.length > 0 && (
          <button onClick={onCheckout} className="mt-3 w-full min-h-[44px] rounded-xl bg-[#d4af37] text-[#1a0f08] text-sm font-bold cursor-pointer">Ir a pagar</button>
        )}
      </div>
    </div>
  );
};
