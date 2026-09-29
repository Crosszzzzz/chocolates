// Per-product 3D/AR asset registry (drop-in ready, no new scans).
//
// Today all 8 bar products share the photogrammetry captures in
// `public/modelos escaneados/` and the shared packshot in `public/images/`.
// The box (`taboada-caja-realeza`) has photo only — no AR/3D yet.
//
// To ship a real per-SKU asset later, edit ONLY this file:
//   1. Drop `public/modelos/<sku>.glb` (+ optional `.usdz`) and
//      `public/images/<sku>.png`.
//   2. Point that SKU's entry at the new URLs (keep `encodeURI` for spaces).
//   3. No component, util, or viewer change needed — `buildShowcaseCards`
//      and `ProductShowcase` already resolve everything through
//      `resolveProductAssets(sku)`.
//
// Dead infra note: the legacy `/models/<sku>.glb` convention
// (`glbProduct.ts` / `arExperience.ts`) ships no files and is NOT touched
// here; this registry is its deprecation path.

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

/** Shared captures, resolved once so every bar entry stays in sync. */
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

function barAssets(targetLongestCm: number): ProductAssets {
  return {
    photo: SHARED_PRODUCT_PHOTO_URL,
    wrappedGlb: SHARED_WRAPPED_GLB,
    unwrappedGlb: SHARED_UNWRAPPED_GLB,
    wrappedUsdz: SHARED_WRAPPED_USDZ,
    unwrappedUsdz: SHARED_UNWRAPPED_USDZ,
    targetLongestCm,
  };
}

/**
 * Per-product registry, keyed by `ProductSpec.id`. `targetLongestCm` mirrors
 * `heightCm` from `src/data/factories.ts` so each bar renders at its true
 * packaging size even while sharing the same scan files.
 */
export const PRODUCT_ASSETS: Record<string, ProductAssets> = {
  'sucre-colonial-canela': barAssets(17.0),
  'sucre-negro-sal-uyuni': barAssets(16.2),
  'sucre-nuez-macadamia': barAssets(15.5),
  'taboada-submarino-puro': barAssets(18.0),
  'taboada-amargo-almendras': barAssets(16.0),
  'parati-bolsa-fruta': {
    photo: encodeURI('/images/parati-bolsa-fruta.png'),
    wrappedGlb: encodeURI('/models/parati-bolsa-fruta-con.glb'),
    unwrappedGlb: encodeURI('/models/parati-bolsa-fruta-sin.glb'),
    wrappedUsdz: encodeURI('/models/parati-bolsa-fruta-con.usdz'),
    unwrappedUsdz: encodeURI('/models/parati-bolsa-fruta-sin.usdz'),
    targetLongestCm: 12,
  },
  'parati-caja-bombones': {
    photo: encodeURI('/images/parati-caja-bombones.png'),
    wrappedGlb: encodeURI('/models/parati-caja-bombones-con.glb'),
    unwrappedGlb: encodeURI('/models/parati-caja-bombones-sin.glb'),
    wrappedUsdz: encodeURI('/models/parati-caja-bombones-con.usdz'),
    unwrappedUsdz: encodeURI('/models/parati-caja-bombones-sin.usdz'),
    targetLongestCm: 5,
  },
  'parati-tableta-coco': {
    photo: encodeURI('/images/parati-tableta-coco.png'),
    wrappedGlb: encodeURI('/models/parati-tableta-coco-con.glb'),
    unwrappedGlb: encodeURI('/models/parati-tableta-coco-sin.glb'),
    wrappedUsdz: encodeURI('/models/parati-tableta-coco-con.usdz'),
    unwrappedUsdz: encodeURI('/models/parati-tableta-coco-sin.usdz'),
    targetLongestCm: 15,
  },
  // Box: photo only — nulls keep AR/3D actions hidden until a scan ships.
  'taboada-caja-realeza': {
    photo: SHARED_PRODUCT_PHOTO_URL,
    wrappedGlb: null,
    unwrappedGlb: null,
    wrappedUsdz: null,
    unwrappedUsdz: null,
    targetLongestCm: 2.2,
  },
};

/** Resolve a SKU to its assets; unknown SKUs fall back to the shared bar set. */
export function resolveProductAssets(sku: string): ProductAssets {
  return PRODUCT_ASSETS[sku] ?? SHARED_PRODUCT_ASSETS;
}
