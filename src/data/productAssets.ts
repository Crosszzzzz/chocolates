// Per-product 3D/AR asset registry (drop-in ready, no new scans).
//
// Every shipped product owns an explicit entry below; unknown SKUs fall back
// to the shared photogrammetry captures in `public/modelos escaneados/` and
// the shared packshot in `public/images/` (see SHARED_PRODUCT_ASSETS).
//
// To ship a real per-SKU asset later, edit ONLY this file:
//   1. Drop `public/modelos/<sku>.glb` (+ optional `.usdz`) and
//      `public/images/<sku>.png`.
//   2. Point that SKU's entry at the new URLs (keep `encodeURI` for spaces).
//   3. No component, util, or viewer change needed — `buildShowcaseCards`
//      and `ProductShowcase` already resolve everything through
//      `resolveProductAssets(sku)`.
//
// Product models are calibrated in meters for native AR viewers. Versioned
// URLs prevent cached, oversized scans from surviving a scale correction.

import {
  BAR_LONGEST_CM,
  resolveScannedModelUrl,
  resolveScannedUsdzUrl,
} from '../utils/scannedModels';

export interface ProductAssets {
  /** Packshot PNG (percent-encoded `public/` URL). */
  photo: string;
  /** Packaged scan for AR; null when the product has no 3D yet. */
  wrappedGlb: string | null;
  /** Unwrapped scan for the 3D detail viewer; null when absent. */
  unwrappedGlb: string | null;
  /** iOS Quick Look pair; absent/null disables quick-look for that variant. */
  wrappedUsdz?: string | null;
  unwrappedUsdz?: string | null;
  /** Real-world longest edge in cm — viewers normalize the scan to this. */
  targetLongestCm: number;
}

// Mirrors SHOWCASE_PRODUCT_PHOTO_* in `src/utils/productShowcase.ts` without
// importing it (that module imports this registry — keep the edge one-way).
/** Shared packshot URL (kept in sync with `resolveShowcaseProductPhotoUrl()`). */
export const SHARED_PRODUCT_PHOTO_URL = encodeURI(
  '/images/imagen chocolate sin fondo.png',
);

/** Shared captures, resolved once so the fallback entries stay in sync. */
export const SHARED_WRAPPED_GLB = resolveScannedModelUrl('wrapped');
export const SHARED_UNWRAPPED_GLB = resolveScannedModelUrl('unwrapped');
export const SHARED_WRAPPED_USDZ = resolveScannedUsdzUrl('wrapped');
export const SHARED_UNWRAPPED_USDZ = resolveScannedUsdzUrl('unwrapped');

/** Fallback assets for unknown SKUs: shared scans at the measured bar size. */
export const SHARED_PRODUCT_ASSETS: ProductAssets = {
  photo: SHARED_PRODUCT_PHOTO_URL,
  wrappedGlb: SHARED_WRAPPED_GLB,
  unwrappedGlb: SHARED_UNWRAPPED_GLB,
  wrappedUsdz: SHARED_WRAPPED_USDZ,
  unwrappedUsdz: SHARED_UNWRAPPED_USDZ,
  targetLongestCm: BAR_LONGEST_CM,
};

/**
 * Per-product registry, keyed by `ProductSpec.id`.
 *
 * `targetLongestCm` is ALWAYS the LONGEST edge of the `dimensions` string in
 * `src/data/factories.ts` (never the resting height / thickness): viewers
 * normalize the bounding box's longest edge onto it, so using `heightCm`
 * shrank boxes (a 22 cm box rendered at 5 cm).
 *
 * Scene Viewer loads the original GLB and Quick Look loads the USDZ, ignoring
 * runtime `scale`. Both files must encode the real size; `ar-scale="fixed"`
 * only prevents user resizing. Wrapped scans match all three package edges;
 * unwrapped scans keep their proportions at the product's longest edge.
 */
export const PRODUCT_ASSETS: Record<string, ProductAssets> = {
  // Wrapped-only drops: no `-sin` scan yet, so `unwrapped*` stay null and the
  // Con/Sin toggle is hidden (see `buildShowcaseCards` + the AR modal).
  'sucre-tableta': {
    photo: encodeURI('/images/sucre-tableta.png'),
    wrappedGlb: encodeURI('/models/sucre-tableta-con.glb?v=real-scale-1'),
    unwrappedGlb: null,
    wrappedUsdz: encodeURI('/models/sucre-tableta-con.usdz?v=real-scale-1'),
    unwrappedUsdz: null,
    targetLongestCm: 15.5,
  },
  'taboada-caja-bombones': {
    photo: encodeURI('/images/taboada-caja-bombones.png'),
    wrappedGlb: encodeURI('/models/taboada-caja-bombones-con.glb?v=real-scale-1'),
    unwrappedGlb: null,
    wrappedUsdz: encodeURI('/models/taboada-caja-bombones-con.usdz?v=real-scale-1'),
    unwrappedUsdz: null,
    targetLongestCm: 18,
  },
  'parati-bolsa-fruta': {
    photo: encodeURI('/images/parati-bolsa-fruta.png'),
    wrappedGlb: encodeURI('/models/parati-bolsa-fruta-con.glb?v=real-scale-1'),
    unwrappedGlb: encodeURI('/models/parati-bolsa-fruta-sin.glb?v=real-scale-1'),
    wrappedUsdz: encodeURI('/models/parati-bolsa-fruta-con.usdz?v=real-scale-1'),
    unwrappedUsdz: encodeURI('/models/parati-bolsa-fruta-sin.usdz?v=real-scale-1'),
    targetLongestCm: 18,
  },
  'parati-caja-bombones': {
    photo: encodeURI('/images/parati-caja-bombones.png'),
    wrappedGlb: encodeURI('/models/parati-caja-bombones-con.glb?v=real-scale-1'),
    unwrappedGlb: encodeURI('/models/parati-caja-bombones-sin.glb?v=real-scale-1'),
    wrappedUsdz: encodeURI('/models/parati-caja-bombones-con.usdz?v=real-scale-1'),
    unwrappedUsdz: encodeURI('/models/parati-caja-bombones-sin.usdz?v=real-scale-1'),
    targetLongestCm: 18,
  },
  'parati-tableta-coco': {
    photo: encodeURI('/images/parati-tableta-coco.png'),
    wrappedGlb: encodeURI('/models/parati-tableta-coco-con.glb?v=real-scale-1'),
    unwrappedGlb: encodeURI('/models/parati-tableta-coco-sin.glb?v=real-scale-1'),
    wrappedUsdz: encodeURI('/models/parati-tableta-coco-con.usdz?v=real-scale-1'),
    unwrappedUsdz: encodeURI('/models/parati-tableta-coco-sin.usdz?v=real-scale-1'),
    targetLongestCm: 13,
  },
};

/** Resolve a SKU to its assets; unknown SKUs fall back to the shared bar set. */
export function resolveProductAssets(sku: string): ProductAssets {
  return PRODUCT_ASSETS[sku] ?? SHARED_PRODUCT_ASSETS;
}
