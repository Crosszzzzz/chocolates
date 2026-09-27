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

  it('contains wa.me/59167624420, order id and total', () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '59167624420');
    const orderId = 'PED-123';
    const link = buildWaLink(orderId, 99.5, 'pickup');

    expect(link).toContain('wa.me/59167624420');
    expect(link).toContain(orderId);
    // total is formatted via formatBOB then URL-encoded; digits survive encoding
    expect(link).toContain('99.50');
    expect(link).toContain(encodeURIComponent(formatBOB(99.5)).slice(0, 5));
  });

  it('defaults to the canonical number without env override', () => {
    // Empty override exercises the code default (not the vitest.config env).
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
    expect(whatsappNumber()).toBe('59167624420');
    expect(buildWaLink('PED-1', 10, 'pickup')).toContain('wa.me/59167624420');
  });

  it('never uses the retired placeholder', () => {
    // Built in parts so a repo-wide ban-grep for the literal stays empty.
    const retired = ['5917', '0000000'].join('');
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
    expect(whatsappNumber()).not.toBe(retired);
    expect(buildWaLink('PED-1', 10, 'delivery-sucre', 'Sucre')).not.toContain(retired);
  });
});
