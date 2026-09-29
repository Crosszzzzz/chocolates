import { describe, expect, it } from 'vitest';
import { FACTORIES } from '../data/factories';
import { addToCartButtonState, buildShowcaseCards, toggleOpenSku } from './productShowcase';

describe('buildShowcaseCards', () => {
  it('gives every bar product the AR + 3D actions and its brand palette', () => {
    const bar = FACTORIES[0].products[0];
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
});

describe('toggleOpenSku', () => {
  it('opens a closed card', () => {
    expect(toggleOpenSku(null, 'a')).toBe('a');
  });

  it('collapses the card that is already open', () => {
    expect(toggleOpenSku('a', 'a')).toBeNull();
  });

  it('switches directly from one card to another', () => {
    expect(toggleOpenSku('a', 'b')).toBe('b');
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
