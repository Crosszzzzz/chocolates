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

/**
 * Self-hosted Draco decoder directory for `<model-viewer>`.
 *
 * model-viewer defaults to a Google CDN
 * (`https://www.gstatic.com/draco/versioned/decoders/1.5.6/`). That host is
 * regularly blocked or throttled on mobile networks, and a failed decoder fetch
 * rejects the whole model load — which surfaces as the hard AR error card even
 * though the app's own three.js viewer already ships the decoder locally. We
 * point model-viewer at the SAME assets copied by `glbProduct.ts`
 * (`DRACO_DECODER_PATH`), so the only decoder origin is our own app.
 *
 * The three files model-viewer 4.x requests from this directory are exactly:
 * `draco_wasm_wrapper.js` + `draco_decoder.wasm` (WASM path) and
 * `draco_decoder.js` (JS fallback).
 */
export const MODEL_VIEWER_DRACO_PATH = '/draco/';

/** Shape of the global config slot model-viewer reads on module evaluation. */
interface ModelViewerGlobal {
  dracoDecoderLocation?: string;
}

/** The registered element class exposes a static writable `dracoDecoderLocation`. */
type ModelViewerElementCtor = ModelViewerGlobal;

let loaderPromise: Promise<boolean> | null = null;
let injectedScript: HTMLScriptElement | null = null;

interface CustomElementsLike {
  get(name: string): unknown;
  whenDefined(name: string): Promise<unknown>;
}

/**
 * Point model-viewer at our self-hosted decoder BEFORE it loads.
 *
 * model-viewer reads `self.ModelViewerElement.dracoDecoderLocation` at module
 * evaluation time and falls back to the gstatic URL otherwise, so the global
 * must exist before the script is injected. When the element is already defined
 * (re-open, HMR) the class's static setter is used instead, which updates the
 * live decoder location.
 */
function primeDracoLocation(): void {
  try {
    const scope = window as unknown as { ModelViewerElement?: ModelViewerGlobal };
    scope.ModelViewerElement = scope.ModelViewerElement || {};
    scope.ModelViewerElement.dracoDecoderLocation = MODEL_VIEWER_DRACO_PATH;

    const registry = window.customElements as CustomElementsLike | undefined;
    const ctor = registry?.get(MODEL_VIEWER_TAG) as ModelViewerElementCtor | undefined;
    if (ctor) ctor.dracoDecoderLocation = MODEL_VIEWER_DRACO_PATH;
  } catch {
    /* best-effort: the gstatic fallback still loads when reachable */
  }
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

/**
 * Drop the cached promise and the failed script tag so the next
 * `loadModelViewer()` retries from scratch. No-op when the element is defined
 * (a successful load is never invalidated).
 */
export function resetModelViewerLoader(): void {
  if (isModelViewerDefined()) return;
  loaderPromise = null;
  const script = injectedScript;
  try {
    if (script?.parentNode) script.parentNode.removeChild(script);
  } catch {
    /* ignore */
  }
  injectedScript = null;
}

/** Inject the model-viewer module once and resolve when the element is defined. */
export function loadModelViewer(): Promise<boolean> {
  if (loaderPromise) {
    // Re-prime on every cache hit: an HMR swap or a StrictMode remount may
    // have replaced the element class/global after the first load, dropping
    // the self-hosted decoder location back to the gstatic default.
    primeDracoLocation();
    return loaderPromise;
  }
  loaderPromise = new Promise<boolean>((resolve) => {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(false);
        return;
      }
      primeDracoLocation();
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
          .catch(() => {
            console.warn('[modelViewerLoader] model-viewer script loaded but the element never defined');
            resolve(false);
          });
      };
      script.onerror = () => {
        console.warn('[modelViewerLoader] failed to load model-viewer from the CDN', MODEL_VIEWER_SCRIPT_URL);
        resolve(false);
      };
      injectedScript = script;
      document.head.appendChild(script);
    } catch {
      resolve(false);
    }
  });
  return loaderPromise;
}
