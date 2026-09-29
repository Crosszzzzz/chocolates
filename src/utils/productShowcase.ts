// Pure helpers for the redesigned product presentation (thumbnail + name cards
// with an expandable AR/3D panel). Kept free of React/DOM so it stays cheap to
// unit-test and so the component only owns the animation state.

import type { ProductSpec } from '../types/chocolate';
import { resolveProductScannedModels } from './scannedModels';

export interface ShowcaseCard {
  sku: string;
  name: string;
  /** Scanned bar model available for real-size AR placement. */
  hasAr: boolean;
  /** Scanned bar model available for the 3D detail (unwrapped) viewer. */
  has3d: boolean;
  /** Miniature palette: wrapper base, cacao tone and accent. */
  thumbnail: { base: string; cacao: string; accent: string };
}

/** Map products onto presentation cards; products without a scan keep no AR/3D. */
export function buildShowcaseCards(products: ProductSpec[]): ShowcaseCard[] {
  return products.map((p) => {
    const scanned = resolveProductScannedModels(p);
    return {
      sku: p.id,
      name: p.name,
      hasAr: scanned !== null,
      has3d: scanned !== null,
      thumbnail: {
        base: p.wrapperPrimaryColor,
        cacao: p.colorHex,
        accent: p.wrapperAccentColor,
      },
    };
  });
}

/**
 * Accordion state for the expandable card: clicking the already-open card
 * collapses it, clicking a different card opens that one and closes the rest.
 */
export function toggleOpenSku(current: string | null, sku: string): string | null {
  return current === sku ? null : sku;
}

export interface AddToCartButtonState {
  disabled: boolean;
  label: string;
}

/**
 * Add-to-cart button state for a stock level. Zero/negative stock keeps the
 * button visible but disabled ("Sin stock") instead of hiding it, so shoppers
 * can still tell the product exists.
 */
export function addToCartButtonState(stock: number): AddToCartButtonState {
  return stock <= 0
    ? { disabled: true, label: 'Sin stock' }
    : { disabled: false, label: 'Añadir al carrito' };
}
