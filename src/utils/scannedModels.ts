// Scanned chocolate-bar assets (photogrammetry captures). Four files ship in
// `public/modelos escaneados/` and are shared by every bar product:
//
// - wrapped   `chocolate con envoltura.glb`   (~452 KB)  → packaged view + AR
// - unwrapped `chocolate sin envoltorio.glb`  (~18 MB)   → detail / "desenvolver" 3D
// - wrapped   `barra con envoltorio.usdz`     (~80 KB)   → iOS Quick Look (AR)
// - unwrapped `barra sin envoltorio.usdz`     (~2 MB)    → iOS Quick Look (3D)
//
// The unwrapped file is heavy on purpose (high-poly scan) and is NEVER loaded
// eagerly: callers must gate it behind an explicit user action (see `lazy`).
// TODO(perf): compress both with `gltfpack -cc` (Draco/meshopt) once the art
// pipeline freezes; the loader already tolerates any GLB, so this is a build step.
//
// File names contain spaces, so every URL is percent-encoded here (never
// hand-build the path in a component).

/** Base path (under `public/`) holding the scanned GLB files. */
export const SCANNED_MODEL_BASE_PATH = '/modelos escaneados';

/** File names on disk, keyed by semantic id. */
export const SCANNED_MODEL_FILES = {
  wrapped: 'chocolate con envoltura.glb',
  unwrapped: 'chocolate sin envoltorio.glb',
} as const;

export type ScannedModelId = keyof typeof SCANNED_MODEL_FILES;

/** iOS Quick Look assets (same folder as the GLB scans). */
export const SCANNED_USDZ_FILES = {
  wrapped: 'barra con envoltorio.usdz',
  unwrapped: 'barra sin envoltorio.usdz',
} as const;

export type ScannedUsdzId = keyof typeof SCANNED_USDZ_FILES;

/** Either presentation variant of the scanned bar. */
export type ScannedVariant = 'wrapped' | 'unwrapped';

export interface ScannedModelMeta {
  id: ScannedModelId;
  /** Spanish UI label (artifacts are Spanish-facing here). */
  labelEs: string;
  /** Percent-encoded URL served by Vite from `public/`. */
  url: string;
  /** Approximate file size in bytes (documentation / lazy-load hint). */
  bytes: number;
  /** True when the asset is too heavy to load without an explicit user action. */
  lazy: boolean;
}

/**
 * Real-world chocolate-bar size, measured from the packaging print:
 * 15.0 x 7.2 x 0.8 cm. Used to normalize both scans to true size in 3D/AR.
 */
export const BAR_SIZE_CM = { lengthCm: 15.0, widthCm: 7.2, thicknessCm: 0.8 } as const;

/** Longest real edge of the bar in cm — the dimension the scans are fit to. */
export const BAR_LONGEST_CM = BAR_SIZE_CM.lengthCm;

/** Percent-encode a scanned model file into a Vite `public/` URL. */
export function resolveScannedModelUrl(
  id: ScannedModelId,
  basePath: string = SCANNED_MODEL_BASE_PATH,
): string {
  return encodeURI(`${basePath}/${SCANNED_MODEL_FILES[id]}`);
}

export interface ScannedUsdzMeta {
  id: ScannedUsdzId;
  /** Spanish UI label (artifacts are Spanish-facing here). */
  labelEs: string;
  /** Percent-encoded URL served by Vite from `public/`. */
  url: string;
  /** Approximate file size in bytes (documentation hint). */
  bytes: number;
}

/** Percent-encode a scanned USDZ file into a Vite `public/` URL. */
export function resolveScannedUsdzUrl(
  id: ScannedUsdzId,
  basePath: string = SCANNED_MODEL_BASE_PATH,
): string {
  return encodeURI(`${basePath}/${SCANNED_USDZ_FILES[id]}`);
}

/** Static metadata for both USDZ scans; `url` is derived to stay in sync. */
export const SCANNED_USDZ: Record<ScannedUsdzId, ScannedUsdzMeta> = {
  wrapped: {
    id: 'wrapped',
    labelEs: 'Con envoltura',
    url: resolveScannedUsdzUrl('wrapped'),
    bytes: 80275,
  },
  unwrapped: {
    id: 'unwrapped',
    labelEs: 'Sin envoltorio',
    url: resolveScannedUsdzUrl('unwrapped'),
    bytes: 2140444,
  },
};

/** Flip the wrapper variant (`wrapped` <-> `unwrapped`) for the live toggle. */
export function toggleScannedVariant(current: ScannedVariant): ScannedVariant {
  return current === 'wrapped' ? 'unwrapped' : 'wrapped';
}

/** Static metadata for both scans; `url` is derived to stay in sync. */
export const SCANNED_MODELS: Record<ScannedModelId, ScannedModelMeta> = {
  wrapped: {
    id: 'wrapped',
    labelEs: 'Con envoltura',
    url: resolveScannedModelUrl('wrapped'),
    bytes: 462264,
    lazy: false,
  },
  unwrapped: {
    id: 'unwrapped',
    labelEs: 'Sin envoltorio',
    url: resolveScannedModelUrl('unwrapped'),
    bytes: 18506384,
    lazy: true,
  },
};

/**
 * Which scanned model a product uses, per presentation intent.
 * `ar` = packaged scan placed on a real surface; `detail3d` = unwrapped scan
 * explored in the 3D viewer. Returns null when the product has no scan yet
 * (e.g. bombones boxes) so the caller keeps its current render.
 */
export interface ProductScannedModels {
  ar: ScannedModelId;
  detail3d: ScannedModelId;
}

export function resolveProductScannedModels(product: {
  type?: string;
}): ProductScannedModels | null {
  if (product.type !== 'bar') return null;
  return { ar: 'wrapped', detail3d: 'unwrapped' };
}

/**
 * Which scanned USDZ asset a product uses for iOS Quick Look, per
 * presentation intent. Mirrors `resolveProductScannedModels` so the AR (`ar`)
 * and 3D (`detail3d`) views each get a matching `ios-src`. Returns null when
 * the product has no scan yet so the caller keeps its current render.
 */
export interface ProductScannedUsdz {
  arIos: ScannedUsdzId;
  detail3dIos: ScannedUsdzId;
}

export function resolveProductScannedUsdz(product: {
  type?: string;
}): ProductScannedUsdz | null {
  if (product.type !== 'bar') return null;
  return { arIos: 'wrapped', detail3dIos: 'unwrapped' };
}

/**
 * Uniform scale mapping a model's native longest edge (glTF scene units, where
 * 1 unit = 1 m) onto the bar's real longest edge. Returns 1 (safe no-op) for
 * degenerate input so callers never produce NaN / Infinity / negative scales.
 */
export function computeScannedModelScale(nativeLongestUnits: number): number {
  if (!Number.isFinite(nativeLongestUnits) || nativeLongestUnits <= 0) return 1;
  return BAR_LONGEST_CM / 100 / nativeLongestUnits;
}
