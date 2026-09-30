// Pure helpers for the redesigned product presentation (thumbnail + name cards
// with an expandable AR/3D panel). Kept free of React/DOM so it stays cheap to
// unit-test and so the component only owns the animation state.

import type { ProductSpec } from '../types/chocolate';
import type { ProductAssets } from '../data/productAssets';
import { PRODUCT_ASSETS, resolveProductAssets } from '../data/productAssets';
import { resolveProductScannedModels } from './scannedModels';

/** Real product packshot (transparent background) served from `public/`. */
export const SHOWCASE_PRODUCT_PHOTO_BASE_PATH = '/images';
export const SHOWCASE_PRODUCT_PHOTO_FILE = 'imagen chocolate sin fondo.png';

/** Percent-encoded URL of the shared product photo for the boutique cards. */
export function resolveShowcaseProductPhotoUrl(
  basePath: string = SHOWCASE_PRODUCT_PHOTO_BASE_PATH,
): string {
  return encodeURI(`${basePath}/${SHOWCASE_PRODUCT_PHOTO_FILE}`);
}

/**
 * Real-size copy for the AR/3D HUDs, derived from the product's own
 * `dimensions` string instead of a hard-coded bar size:
 * `15.0 x 7.5 x 0.8 cm (est.)` → `15 × 7.5 × 0.8 cm`.
 * Returns null when there is nothing to render so callers can fall back.
 */
export function formatDimensionsLabel(dimensions?: string | null): string | null {
  if (typeof dimensions !== 'string') return null;
  const cleaned = dimensions
    .replace(/\s*\((?:est\.|estimado)\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  const parts = cleaned.split(/\s+x\s+/i);
  const label = parts.length > 1 ? parts.join(' × ') : cleaned;
  return label.replace(/(\d+)\.0(?=\s|$)/g, '$1');
}

export interface ShowcaseVariantUrls {
  wrappedUrl: string;
  unwrappedUrl: string;
  wrappedIosSrc?: string | null;
  unwrappedIosSrc?: string | null;
}

export interface ShowcaseCard {
  sku: string;
  name: string;
  /** Scanned bar model available for real-size AR placement. */
  hasAr: boolean;
  /** Scanned bar model available for the 3D detail (unwrapped) viewer. */
  has3d: boolean;
  /** Miniature palette: wrapper base, cacao tone and accent. */
  thumbnail: { base: string; cacao: string; accent: string };
  /** Boutique hierarchy: tagline, cacao %, weight and optional badge. */
  subtitle: string;
  cacaoPercentage: number;
  weight: string;
  badge?: string;
  /** Per-product packshot from the asset registry; the card falls back to `thumbnail` when it fails. */
  photoUrl: string;
  /** Per-product 3D/AR registry entry (shared scans today, drop-in per SKU). */
  assets: ProductAssets;
  /** Live variant URLs for the viewers; null when the product has no scan. */
  variantUrls: ShowcaseVariantUrls | null;
  /** Real-world longest edge in cm the viewers normalize the scan to. */
  targetLongestCm: number;
}

/** Map products onto presentation cards; products without a scan keep no AR/3D.
 * `hasAr`/`has3d` fall back to the per-SKU registry so boxes with real
 * GLB/USDZ assets (e.g. Para Ti bolsa/caja) get AR/3D even though
 * `resolveProductScannedModels` only covers bars. A SKU that owns a registry
 * entry is authoritative, so a wrapped-only product (`unwrappedGlb: null`)
 * never advertises a 3D action whose modal would open empty. */
export function buildShowcaseCards(products: ProductSpec[]): ShowcaseCard[] {
  return products.map((p) => {
    const scanned = resolveProductScannedModels(p);
    const assets = resolveProductAssets(p.id);
    const ownsAssets = Object.prototype.hasOwnProperty.call(PRODUCT_ASSETS, p.id);
    const hasAr = ownsAssets
      ? assets.wrappedGlb !== null
      : scanned !== null || assets.wrappedGlb !== null;
    const has3d = ownsAssets
      ? assets.unwrappedGlb !== null
      : scanned !== null || assets.unwrappedGlb !== null;
    const variantUrls: ShowcaseVariantUrls | null =
      assets.wrappedGlb && assets.unwrappedGlb
        ? {
            wrappedUrl: assets.wrappedGlb,
            unwrappedUrl: assets.unwrappedGlb,
            wrappedIosSrc: assets.wrappedUsdz ?? null,
            unwrappedIosSrc: assets.unwrappedUsdz ?? null,
          }
        : null;
    return {
      sku: p.id,
      name: p.name,
      hasAr,
      has3d,
      thumbnail: {
        base: p.wrapperPrimaryColor,
        cacao: p.colorHex,
        accent: p.wrapperAccentColor,
      },
      subtitle: p.subtitle,
      cacaoPercentage: p.cacaoPercentage,
      weight: p.weight,
      badge: p.badge,
      photoUrl: assets.photo,
      assets,
      variantUrls,
      targetLongestCm: assets.targetLongestCm,
    };
  });
}

/**
 * Independent toggle state for the expandable cards: each SKU opens/closes
 * on its own without affecting the rest. Returns a new Set (never mutates
 * the input) so React state updates stay immutable.
 */
export function toggleOpenSku(current: ReadonlySet<string>, sku: string): Set<string> {
  const next = new Set(current);
  if (next.has(sku)) {
    next.delete(sku);
  } else {
    next.add(sku);
  }
  return next;
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
