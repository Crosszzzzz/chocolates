import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { buildCheckoutBody } from '../lib/checkout';
import type { CatalogMap } from './CartDrawer';
import type { FulfillmentKind } from '../types/chocolate';
import { buildWaLink, formatBOB } from '../lib/whatsapp';
import { isDeliveryAddressValid } from '../lib/delivery-address';
interface Props { open: boolean; catalog: CatalogMap; onClose: () => void }
type Phase = 'form' | 'loading' | 'done';
export const CheckoutModal: React.FC<Props> = ({ open, catalog, onClose }) => {
  const { lines, clear } = useCart();
  const { user } = useAuth();
  const [fulfillment, setFulfillment] = useState<FulfillmentKind>('pickup');
  const [address, setAddress] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [errorEs, setErrorEs] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderItems, setOrderItems] = useState<{ qty: number; name: string }[]>([]);
  const total = useMemo(() => lines.reduce((n, l) => n + (catalog[l.sku]?.priceBOB ?? 0) * l.qty, 0), [lines, catalog]);
  if (!open) return null;
  const waLink = orderId !== null ? buildWaLink(orderTotal, fulfillment, address.trim(), orderItems) : null;
  async function confirm() {
    setPhase('loading'); setErrorEs(null);
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCheckoutBody(lines, fulfillment, address.trim(), total, user?.id)) });
      const data = (await res.json()) as { orderId?: string; totalBOB?: number; error_es?: string };
      if (!res.ok) { setErrorEs(data.error_es ?? 'No se pudo procesar el pedido'); setPhase('form'); return }
      const snapshot = lines.map((l) => ({ qty: l.qty, name: catalog[l.sku]?.nameEs ?? l.sku }));
      setOrderItems(snapshot);
      setOrderId(data.orderId ?? ''); setOrderTotal(typeof data.totalBOB === 'number' ? data.totalBOB : total);
      setPhase('done'); clear();
    } catch { setErrorEs('No se pudo procesar el pedido'); setPhase('form') }
  }
  const delivery = fulfillment === 'delivery-sucre';
  const addressValid = !delivery || isDeliveryAddressValid(address);
  const pickupAddress = ((import.meta.env.VITE_PICKUP_ADDRESS as string | undefined) ?? '').trim();
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Finalizar compra">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#fffdf8] dark:bg-[#1c100a] border border-[#d4af37]/30 rounded-t-2xl sm:rounded-2xl p-5 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">Finalizar compra</h2>
          <button onClick={onClose} aria-label="Cerrar compra" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {phase === 'done' && orderId !== null && waLink !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[#5c4433] dark:text-[#d7c4b7]">Pedido reservado por {formatBOB(orderTotal)}. Pago simulado, sin cargo real.</p>
            <a href={waLink} target="_blank" rel="noreferrer" className="min-h-[44px] flex items-center justify-center rounded-xl bg-[#d4af37] text-[#1a0f08] text-sm font-bold px-4 cursor-pointer">Confirmar por WhatsApp</a>
            <button onClick={onClose} className="min-h-[44px] rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 text-sm cursor-pointer">Seguir explorando</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[#7a5c48] dark:text-[#bda393]">Total: <span className="text-sm font-extrabold text-[#8a6216] dark:text-[#f1c40f]">{formatBOB(total)}</span> · Pago simulado, sin cargo real.</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Modalidad de entrega">
              {(['pickup', 'delivery-sucre'] as FulfillmentKind[]).map((k) => (
                <button key={k} role="radio" aria-checked={fulfillment === k} onClick={() => setFulfillment(k)} className={`flex-1 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${fulfillment === k ? 'bg-[#d4af37] text-[#1a0f08] border-[#d4af37]' : 'bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border-[#d4af37]/25'}`}>
                  {k === 'pickup' ? 'Recojo en tienda' : 'Delivery Sucre'}
                </button>
              ))}
            </div>
            {!delivery && (
              <p className="text-xs text-[#7a5c48] dark:text-[#bda393]">Retiro en tienda: {pickupAddress !== '' ? pickupAddress : 'Coordinamos el retiro por WhatsApp'}</p>
            )}
            {delivery && (
              <>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número y referencia" aria-label="Calle, número y referencia" autoComplete="street-address"
                  className="min-h-[44px] rounded-xl bg-[#ffffff] dark:bg-[#25130b] border border-[#d4af37]/20 px-3 text-sm text-[#2b1a12] dark:text-[#fcf8f2] placeholder:text-[#8a7265]" />
                <p className="text-xs text-[#7a5c48] dark:text-[#bda393]">Delivery solo en Sucre — escribí tu calle</p>
                {!addressValid && (
                  <p role="alert" className="text-xs font-bold text-[#b3261e] dark:text-[#f0a6a6]">
                    Escribí tu calle y número para el delivery en Sucre (mínimo 6 caracteres).
                  </p>
                )}
              </>
            )}
            {errorEs !== null && <p role="alert" className="text-xs text-[#b3261e] dark:text-[#f0a6a6]">{errorEs}</p>}
            <button onClick={() => void confirm()} disabled={phase === 'loading' || lines.length === 0 || !addressValid} className="min-h-[44px] rounded-xl bg-[#d4af37] text-[#1a0f08] text-sm font-bold disabled:opacity-60 cursor-pointer">
              {phase === 'loading' ? 'Reservando…' : `Pagar ${formatBOB(total)} (simulado)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
