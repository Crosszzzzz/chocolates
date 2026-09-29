import { describe, expect, it } from 'vitest';
import { FACTORIES } from '../data/factories';
import { resolveProductAssets } from '../data/productAssets';
import {
  addToCartButtonState,
  buildShowcaseCards,
  resolveShowcaseProductPhotoUrl,
  toggleOpenSku,
} from './productShowcase';

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

  it('leaves products without a scanned model (boxes) without AR/3D', () => {
    const box = FACTORIES[2].products.find((p) => p.type === 'box');
    expect(box).toBeDefined();
    const [card] = buildShowcaseCards([box!]);
    expect(card.hasAr).toBe(false);
    expect(card.has3d).toBe(false);
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
