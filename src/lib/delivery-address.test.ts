import { describe, expect, it } from 'vitest';
import { isDeliveryAddressValid } from '../../api/checkout';
import { isDeliveryAddressValid as isClientDeliveryAddressValid } from './delivery-address';

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

// The client keeps its own copy (browser bundles must not import from api/*).
// These tests pin the client rule and prove it matches the server authority.
describe('isDeliveryAddressValid (client replica)', () => {
  it('requires at least 6 trimmed characters', () => {
    expect(isClientDeliveryAddressValid('calle dalence')).toBe(true);
    expect(isClientDeliveryAddressValid('abcdef')).toBe(true);
    expect(isClientDeliveryAddressValid('abcde')).toBe(false);
  });

  it('rejects blank input', () => {
    expect(isClientDeliveryAddressValid('')).toBe(false);
    expect(isClientDeliveryAddressValid('   ')).toBe(false);
  });

  it('agrees with the server authority for representative inputs', () => {
    const cases = ['', '   ', 'abc', 'abcdef', 'calle dalence', 'Sucre centro'];
    for (const addr of cases) {
      expect(isClientDeliveryAddressValid(addr)).toBe(isDeliveryAddressValid(addr));
    }
  });
});
