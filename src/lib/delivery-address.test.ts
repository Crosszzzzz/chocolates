import { describe, expect, it } from 'vitest';
import { isDeliveryAddressValid } from '../../api/checkout';

// Server guard for delivery-sucre: zone is implied by the fulfillment mode,
// the street field only needs a plausible street + number (>= 6 chars).
describe('isDeliveryAddressValid', () => {
  it("accepts a tourist street without the city name ('calle dalence')", () => {
    expect(isDeliveryAddressValid('calle dalence')).toBe(true);
  });

  it("still accepts existing addresses ('Sucre centro')", () => {
    expect(isDeliveryAddressValid('Sucre centro')).toBe(true);
  });

  it('rejects empty and too-short addresses', () => {
    expect(isDeliveryAddressValid('')).toBe(false);
    expect(isDeliveryAddressValid('   ')).toBe(false);
    expect(isDeliveryAddressValid('abc')).toBe(false);
  });
});
