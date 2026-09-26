import type { FulfillmentKind } from '../types/chocolate';
// wa.me handoff (PR4, mvp-completo). Blocker 1.4 open: canonical number pending,
// placeholder from .env.example used until confirmed.
export function whatsappNumber(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WHATSAPP_NUMBER;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : '59170000000';
}
export function formatBOB(n: number): string { return `Bs ${n.toFixed(2)}` }
export function buildWaLink(orderId: string, totalBOB: number, fulfillment: FulfillmentKind, address?: string): string {
  const modo = fulfillment === 'pickup' ? 'Recojo en tienda' : `Delivery en Sucre${address ? ` — ${address}` : ''}`;
  const msg = `Hola, confirmo mi pedido ${orderId} por ${formatBOB(totalBOB)} (${modo}). Pago simulado, sin cargo real.`;
  return `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(msg)}`;
}
