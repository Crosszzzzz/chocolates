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
export type WaOrderItem = { qty: number; name: string };
export function buildWaLink(totalBOB: number, fulfillment: FulfillmentKind, address?: string, items?: WaOrderItem[]): string {
  const lines: string[] = ['Hola, quiero confirmar mi pedido de chocolates:', ''];
  const cleanItems = (items ?? []).filter((it) => Number.isInteger(it.qty) && it.qty > 0 && it.name.trim() !== '');
  if (cleanItems.length > 0) {
    lines.push('*Detalle del pedido*');
    for (const it of cleanItems) lines.push(`${it.qty} x ${it.name.trim()}`);
    lines.push('');
  }
  lines.push(`*Total: ${formatBOB(totalBOB)}*`);
  const entrega = fulfillment === 'pickup' ? 'Recojo en tienda' : `Delivery en Sucre${address?.trim() ? ` — ${address.trim()}` : ''}`;
  lines.push(`*Entrega: ${entrega}*`);
  lines.push('Nota: Pago simulado, sin cargo real.');
  return `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(lines.join('\n'))}`;
}
