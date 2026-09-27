import type { FulfillmentKind } from '../types/chocolate';
// wa.me handoff: canonical business number +59167624420 by default,
// VITE_WHATSAPP_NUMBER wins when set. The retired placeholder number
// must never return here.
export function whatsappNumber(): string {
  const meta = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WHATSAPP_NUMBER;
  if (typeof meta === 'string' && meta.trim() !== '') return meta.trim();
  // Vitest/Node fallback: vi.stubEnv always writes process.env, while
  // import.meta.env is per-module and may not propagate across modules.
  const proc =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>).VITE_WHATSAPP_NUMBER
      : undefined;
  if (typeof proc === 'string' && proc.trim() !== '') return proc.trim();
  return '59167624420';
}
export function formatBOB(n: number): string { return `Bs ${n.toFixed(2)}` }
export function buildWaLink(orderId: string, totalBOB: number, fulfillment: FulfillmentKind, address?: string): string {
  const modo = fulfillment === 'pickup' ? 'Recojo en tienda' : `Delivery en Sucre${address ? ` — ${address}` : ''}`;
  const msg = `Hola, confirmo mi pedido ${orderId} por ${formatBOB(totalBOB)} (${modo}). Pago simulado, sin cargo real.`;
  return `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(msg)}`;
}
