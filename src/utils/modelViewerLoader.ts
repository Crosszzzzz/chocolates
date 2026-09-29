// Lazy loader for `<model-viewer>` (Google's web component) used ONLY by the AR
// view. We load it from a pinned CDN build instead of bundling it because:
//   1. it is ~600 KB of self-contained WebGL/AR runtime, and
//   2. its npm build pins `three@^0.183` as a peer while this repo ships
//      `three@0.186` — installing it would need `--legacy-peer-deps` and risks
//      resolving against the host three at runtime.
// The CDN module bundles its own three, so the versions cannot clash. Keeping
// it out of the bundle means the app shell and the 3D viewer stay lean.
//
// The loader is idempotent, never rejects and resolves `false` on any failure
// (offline, blocked CDN, no customElements) so the AR view can show a graceful
// fallback instead of a broken screen.

/** Pinned model-viewer build (self-contained, bundles its own three). */
export const MODEL_VIEWER_VERSION = '4.3.1';
export const MODEL_VIEWER_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/@google/model-viewer@${MODEL_VIEWER_VERSION}/dist/model-viewer.min.js`;

/** Custom element tag registered by the script. */
export const MODEL_VIEWER_TAG = 'model-viewer';

let loaderPromise: Promise<boolean> | null = null;

interface CustomElementsLike {
  get(name: string): unknown;
  whenDefined(name: string): Promise<unknown>;
}

/** True when the `<model-viewer>` custom element is already registered. */
export function isModelViewerDefined(win: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  try {
    const registry = win?.customElements as CustomElementsLike | undefined;
    return !!registry && registry.get(MODEL_VIEWER_TAG) !== undefined;
  } catch {
    return false;
  }
}

/** Inject the model-viewer module once and resolve when the element is defined. */
export function loadModelViewer(): Promise<boolean> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<boolean>((resolve) => {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(false);
        return;
      }
      // Re-check on every call: another import may have already registered it.
      if (isModelViewerDefined()) {
        resolve(true);
        return;
      }
      const registry = window.customElements as CustomElementsLike | undefined;
      if (!registry) {
        resolve(false);
        return;
      }
      const script = document.createElement('script');
      script.type = 'module';
      script.src = MODEL_VIEWER_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        registry
          .whenDefined(MODEL_VIEWER_TAG)
          .then(() => resolve(true))
          .catch(() => resolve(false));
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    } catch {
      resolve(false);
    }
  });
  return loaderPromise;
}
