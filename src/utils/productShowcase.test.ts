import { describe, expect, it } from 'vitest';
import { FACTORIES } from '../data/factories';
import { resolveProductAssets } from '../data/productAssets';
import {
  addToCartButtonState,
  buildShowcaseCards,
  formatDimensionsLabel,
  resolveShowcaseProductPhotoUrl,
  toggleOpenSku,
} from './productShowcase';

const ALL_PRODUCTS = FACTORIES.flatMap((f) => f.products);

describe('buildShowcaseCards', () => {
  it('gives every bar product the AR + 3D actions and its brand palette', () => {
    const bar = FACTORIES[0].products.find((p) => p.type === 'bar')!;
    expect(bar).toBeDefined();
    const [card] = buildShowcaseCards([bar]);
    expect(card.sku).toBe(bar.id);
    expect(card.name).toBe(bar.name);
    expect(card.hasAr).toBe(true);
    expect(card.has3d).toBe(true);
    expect(card.thumbnail).toEqual({
      base: bar.wrapperPrimaryColor,
      cacao: bar.colorHex,
      accent: bar.wrapperAccentColor,
    });
  });

  it('keeps the box without an unwrapped scan off the 3D action', () => {
    const box = FACTORIES[2].products.find((p) => p.type === 'box');
    expect(box).toBeDefined();
    const [card] = buildShowcaseCards([box!]);
    expect(card.hasAr).toBe(true);
    expect(card.has3d).toBe(false);
    expect(card.variantUrls).toBeNull();
  });

  it('keeps a wrapped-only product on AR without a dead 3D action or toggle', () => {
    const wrappedOnly = ALL_PRODUCTS.filter(
      (p) => resolveProductAssets(p.id).unwrappedGlb === null && resolveProductAssets(p.id).wrappedGlb !== null,
    );
    expect(wrappedOnly.map((p) => p.id)).toEqual(['sucre-tableta', 'taboada-caja-bombones']);
    for (const product of wrappedOnly) {
      const [card] = buildShowcaseCards([product]);
      expect(card.hasAr).toBe(true);
      expect(card.has3d).toBe(false);
      expect(card.variantUrls).toBeNull();
      expect(card.assets.unwrappedUsdz ?? null).toBeNull();
    }
  });

  it('normalizes every product to the longest edge of its dimensions string', () => {
    const longestEdgeCm = (dimensions: string): number =>
      Math.max(...(dimensions.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
    for (const product of ALL_PRODUCTS) {
      const assets = resolveProductAssets(product.id);
      expect(assets.targetLongestCm, product.id).toBeCloseTo(longestEdgeCm(product.dimensions), 5);
    }
  });

  it('carries the boutique hierarchy (subtitle, cacao, weight, badge, photo)', () => {
    const bar = FACTORIES[0].products.find((p) => p.type === 'bar')!;
    expect(bar).toBeDefined();
    const [card] = buildShowcaseCards([bar]);
    expect(card.subtitle).toBe(bar.subtitle);
    expect(card.cacaoPercentage).toBe(bar.cacaoPercentage);
    expect(card.weight).toBe(bar.weight);
    expect(card.badge).toBe(bar.badge);
    expect(card.photoUrl).toBe(resolveProductAssets(bar.id).photo);
  });
});

describe('formatDimensionsLabel', () => {
  it('drops the estimate note and renders multiplication signs', () => {
    expect(formatDimensionsLabel('15.0 x 7.5 x 0.8 cm (est.)')).toBe('15 × 7.5 × 0.8 cm');
  });

  it('trims trailing .0 from every edge', () => {
    expect(formatDimensionsLabel('22.0 x 16.0 x 5.0 cm (est.)')).toBe('22 × 16 × 5 cm');
  });

  it('keeps a plain single-edge string as-is', () => {
    expect(formatDimensionsLabel('12 cm')).toBe('12 cm');
  });

  it('returns null for missing or blank input', () => {
    expect(formatDimensionsLabel(null)).toBeNull();
    expect(formatDimensionsLabel(undefined)).toBeNull();
    expect(formatDimensionsLabel('   ')).toBeNull();
  });
});

describe('resolveShowcaseProductPhotoUrl', () => {
  it('percent-encodes the spaces in the file name', () => {
    expect(resolveShowcaseProductPhotoUrl()).toBe(
      '/images/imagen%20chocolate%20sin%20fondo.png',
    );
  });

  it('honors a custom base path', () => {
    expect(resolveShowcaseProductPhotoUrl('/assets')).toBe(
      '/assets/imagen%20chocolate%20sin%20fondo.png',
    );
  });
});

describe('toggleOpenSku', () => {
  it('opens a closed card', () => {
    expect(toggleOpenSku(new Set(), 'a')).toEqual(new Set(['a']));
  });

  it('collapses only the card that is already open', () => {
    expect(toggleOpenSku(new Set(['a']), 'a')).toEqual(new Set());
  });

  it('opens a second card without closing the first (independent toggles)', () => {
    expect(toggleOpenSku(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']));
  });

  it('closing one card keeps the others open', () => {
    expect(toggleOpenSku(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']));
  });

  it('does not mutate the input set', () => {
    const current = new Set(['a']);
    toggleOpenSku(current, 'b');
    expect(current).toEqual(new Set(['a']));
  });
});

describe('addToCartButtonState', () => {
  it('enables add with the Spanish label when stock is available', () => {
    expect(addToCartButtonState(3)).toEqual({ disabled: false, label: 'Añadir al carrito' });
  });

  it('keeps the button visible but disabled ("Sin stock") at zero or negative stock', () => {
    expect(addToCartButtonState(0)).toEqual({ disabled: true, label: 'Sin stock' });
    expect(addToCartButtonState(-2)).toEqual({ disabled: true, label: 'Sin stock' });
  });
});
