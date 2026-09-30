import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWaLink, formatBOB, whatsappNumber } from './whatsapp';

describe('formatBOB', () => {
  it('formats with Bs prefix and 2 decimals', () => {
    expect(formatBOB(10)).toBe('Bs 10.00');
    expect(formatBOB(39.5)).toBe('Bs 39.50');
    expect(formatBOB(0)).toBe('Bs 0.00');
  });
});

describe('buildWaLink', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds a presentable message with items, total and pickup, without ids or emojis', () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '59167624420');
    const link = buildWaLink(94.5, 'pickup', '', [
      { qty: 2, name: 'Tableta 70% Cacao' },
      { qty: 1, name: 'Caja de Bombones' },
    ]);
    const msg = decodeURIComponent(link.split('text=')[1] ?? '');

    expect(link).toContain('wa.me/59167624420');
    expect(msg).toContain('Hola, quiero confirmar mi pedido de chocolates:');
    expect(msg).toContain('2 x Tableta 70% Cacao');
    expect(msg).toContain('1 x Caja de Bombones');
    expect(msg).toContain('Bs 94.50');
    expect(msg).toContain('Recojo en tienda');
    expect(msg).toContain('Pago simulado, sin cargo real.');
    // No internal ids (UUID-like) and no emojis in the payload.
    expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('includes the delivery address on delivery-sucre orders', () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '59167624420');
    const link = buildWaLink(94.5, 'delivery-sucre', 'calle bolivar', [{ qty: 1, name: 'Tableta con Coco' }]);
    const msg = decodeURIComponent(link.split('text=')[1] ?? '');
    expect(msg).toContain('Delivery en Sucre — calle bolivar');
    expect(msg).toContain('1 x Tableta con Coco');
  });

  it('defaults to the canonical number without env override', () => {
    // Empty override exercises the code default (not the vitest.config env).
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
    expect(whatsappNumber()).toBe('59167624420');
    expect(buildWaLink(10, 'pickup')).toContain('wa.me/59167624420');
  });

  it('never uses the retired placeholder', () => {
    // Built in parts so a repo-wide ban-grep for the literal stays empty.
    const retired = ['5917', '0000000'].join('');
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
    expect(whatsappNumber()).not.toBe(retired);
    expect(buildWaLink(10, 'delivery-sucre', 'Sucre')).not.toContain(retired);
  });
});
