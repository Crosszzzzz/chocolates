// M5: AR experience pure helpers (unit-testable, no DOM/three.js imports).
//
// No AR assets ship with the repo: every helper degrades gracefully
// (missing WebXR, missing USDZ file, missing fetch) by returning a safe
// default instead of throwing, so callers can render a fallback view.

/** Reference scale (meters) for the product anchor in the AR scene. */
export const AR_REFERENCE_SCALE_M = 0.162;

/** Long-press duration (ms) required to place the product anchor. */
export const HOLD_TO_PLACE_MS = 1000;

/** Static base path (under `public/`) for per-product USDZ assets. */
export const USDZ_BASE_PATH = '/models';

/** Minimal navigator surface for WebXR capability detection (mocks implement it). */
export interface NavigatorXrLike {
  xr?: {
    isSessionSupported?: (mode: string) => Promise<boolean>;
  };
}

/** Resolve the USDZ url for a product sku, e.g. `bars-foo` → `/models/bars-foo.usdz`. */
export function resolveUsdzUrl(sku: string, basePath: string = USDZ_BASE_PATH): string {
  return `${basePath}/${sku.trim()}.usdz`;
}

/**
 * True when the runtime supports WebXR `immersive-ar`. Never throws and never
 * touches `navigator` unguarded, so desktop/SSR contexts safely resolve false.
 * Pass `nav` in tests to avoid stubbing globals.
 */
export async function isImmersiveArSupported(nav?: NavigatorXrLike | null): Promise<boolean> {
  try {
    const candidate: unknown =
      nav ?? (typeof globalThis.navigator === 'undefined' ? null : globalThis.navigator);
    if (!candidate || typeof candidate !== 'object') return false;
    const xr = (candidate as NavigatorXrLike).xr;
    if (!xr || typeof xr.isSessionSupported !== 'function') return false;
    const supported = await xr.isSessionSupported('immersive-ar');
    return supported === true;
  } catch {
    return false;
  }
}

/** Minimal fetch surface for the USDZ availability check (mocks implement it). */
export type FetchHeadLike = (
  input: string,
  init?: { method?: string },
) => Promise<{ ok: boolean }>;

/**
 * HEAD-check whether the USDZ asset exists. Resolves true only on an ok
 * response; any failure (404, network error, missing fetch) resolves false —
 * never rejects — so the iOS Quick Look section can simply hide itself.
 * Pass `fetchFn` in tests to avoid stubbing globals.
 */
export async function checkUsdzAvailable(url: string, fetchFn?: FetchHeadLike): Promise<boolean> {
  try {
    const fn: FetchHeadLike | null =
      fetchFn ?? (typeof globalThis.fetch === 'undefined' ? null : (globalThis.fetch as FetchHeadLike));
    if (!fn) return false;
    const res = await fn(url, { method: 'HEAD' });
    return !!res && res.ok === true;
  } catch {
    return false;
  }
}
