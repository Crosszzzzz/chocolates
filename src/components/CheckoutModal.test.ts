import { describe, expect, it } from 'vitest';
import { buildCheckoutBody } from '../lib/checkout';

describe('buildCheckoutBody', () => {
  const lines = [{ sku: 'TAB-70', qty: 2 }];

  it('attaches userId for logged-in buyers', () => {
    const body = buildCheckoutBody(lines, 'pickup', '', 79, '550e8400-e29b-41d4-a716-446655440000');
    expect(body).toMatchObject({ userId: '550e8400-e29b-41d4-a716-446655440000', clientTotalBOB: 79 });
  });

  it('omits userId for guests (key absent, no 500)', () => {
    for (const guest of [null, undefined, '', '   ']) {
      const body = buildCheckoutBody(lines, 'delivery-sucre', 'Sucre centro', 79, guest);
      expect(body).not.toHaveProperty('userId');
      expect(body).toMatchObject({ fulfillment: 'delivery-sucre', clientTotalBOB: 79 });
    }
  });
});
