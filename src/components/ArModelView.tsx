import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Package, PackageOpen, RotateCcw, ScanLine, Smartphone, X } from 'lucide-react';
import { loadModelViewer, resetModelViewerLoader } from '../utils/modelViewerLoader';
import { loadModelFromUrl } from '../utils/glbProduct';
import { BAR_LONGEST_CM, BAR_SIZE_CM, toggleScannedVariant, type ScannedVariant } from '../utils/scannedModels';
import { formatDimensionsLabel } from '../utils/productShowcase';

export interface ArVariantUrls {
  wrappedUrl: string;
  unwrappedUrl: string;
  wrappedIosSrc?: string | null;
  unwrappedIosSrc?: string | null;
}

interface ArModelViewProps {
  /** Initial (legacy single-model) percent-encoded GLB url. */
  modelUrl: string;
  /** Product name shown in the header. */
  title: string;
  /** Optional iOS Quick Look asset; when absent quick-look is disabled. */
  iosSrc?: string | null;
  /**
   * When set, a visible "Con envoltorio / Sin envoltorio" switch swaps the
   * model (and its `ios-src`) live. Omit to keep the legacy single model.
   */
  variantUrls?: ArVariantUrls | null;
  /** Which variant shows first when `variantUrls` is set. */
  initialVariant?: ScannedVariant;
  /** Packshot shown while the model loads (`model-viewer` poster). */
  poster?: string | null;
  /** Real-world longest edge in cm the scan is normalized to. */
  targetLongestCm?: number;
  /** Product's own `dimensions` string, used for the real-size HUD copy. */
  dimensions?: string | null;
  onClose: () => void;
}

type Phase = 'loading' | 'ready' | 'unavailable';
/**
 * Why the viewer is unavailable, so "Reintentar" can act correctly:
 * - `viewer`: the model-viewer script was blocked/never defined → drop the
 *   cached loader promise and re-inject the script.
 * - `model`: the element defined but failed to load/decode `src` (e.g. the
 *   Draco decoder fetch) → remount the element so it retries the model.
 */
type ErrorKind = 'viewer' | 'model';
/** Best-effort scale measurement: never gates the viewer, only the copy. */
type ScaleState = 'measuring' | 'measured' | 'unverified';

interface ArStatusDetail {
  status?: string;
}

// Grace window before a model-viewer `error` event is trusted: on slow
// networks the 5–15 MB Draco GLBs can emit a transient error while the decode
// (or the /draco/*.wasm fetch) is still in flight. Only when the element is
// still mounted with the same `src` and still not `loaded` after this budget
// do we flip to `unavailable`.
const ERROR_GRACE_MS = 1200;

// The scanned models are small enough for AR (explicit user action), so we
// measure each once with three to derive the true real-size scale for
// `<model-viewer scale>`. Cached per url to avoid re-measuring on reopen.
const scaleCache = new Map<string, number>();

function isIosDevice(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const iPadOs =
      (navigator as unknown as { platform?: string }).platform === 'MacIntel' &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || iPadOs;
  } catch {
    return false;
  }
}

/**
 * Measure the GLB once and return the scale that maps its longest edge onto
 * `targetLongestCm`. Returns `null` when the model cannot be measured
 * (missing file, parse error or the PRODUCT_MODEL_TIMEOUT_MS budget elapsing
 * on a 5–15 MB scan) so callers can degrade instead of blocking.
 */
async function measureRealScale(url: string, targetLongestCm: number): Promise<number | null> {
  const cacheKey = `${url}@${targetLongestCm}`;
  const cached = scaleCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const loaded = await loadModelFromUrl(url, { targetLongestCm });
  if (!loaded) return null;
  const scale = loaded.scale > 0 && Number.isFinite(loaded.scale) ? loaded.scale : 1;
  loaded.object.traverse((child) => {
    const mesh = child as { isMesh?: boolean; geometry?: { dispose: () => void }; material?: unknown };
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const material = mesh.material as
        | { dispose?: () => void }
        | { dispose?: () => void }[]
        | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose?.());
      else material?.dispose?.();
    }
  });
  scaleCache.set(cacheKey, scale);
  return scale;
}

/**
 * AR view backed by `<model-viewer>`: detects a real-world surface (`floor`
 * placement) and anchors the product at a fixed size (`fixed` scale locked to
 * the measured real-world `scale`, so the user cannot deform the
 * model). Scale measurement is best-effort and never blocks the screen — see
 * the effect below. Degrades gracefully: no WebGL, blocked CDN or a
 * missing/broken `src` never yield a blank screen.
 */
export const ArModelView: React.FC<ArModelViewProps> = ({
  modelUrl,
  title,
  iosSrc,
  variantUrls,
  initialVariant = 'wrapped',
  poster,
  targetLongestCm = BAR_LONGEST_CM,
  dimensions,
  onClose,
}) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  // Bumped by "Reintentar": re-runs the loader effect and remounts the element.
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const [scale, setScale] = useState<number>(1);
  const [scaleState, setScaleState] = useState<ScaleState>('measuring');
  const [variant, setVariant] = useState<ScannedVariant>(initialVariant);
  // Glass hint shown only during an active AR session before placement.
  const [showArHint, setShowArHint] = useState<boolean>(false);
  const viewerRef = useRef<HTMLElement | null>(null);
  // True once the element fired `load` (or reports `loaded`): late `error`
  // events after this point are spurious and must never show the error card.
  const loadOkRef = useRef<boolean>(false);
  // Pending false-error grace timer; always cleared on cleanup/retry/load.
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ios = isIosDevice();

  // Real-size copy comes from the product's own dimensions, never a constant.
  const dimsLabel =
    formatDimensionsLabel(dimensions) ??
    `${BAR_SIZE_CM.lengthCm} × ${BAR_SIZE_CM.widthCm} × ${BAR_SIZE_CM.thicknessCm} cm`;

  // Active assets: the toggle variant when wired, otherwise the legacy props.
  const activeUrl = variantUrls
    ? variant === 'wrapped'
      ? variantUrls.wrappedUrl
      : variantUrls.unwrappedUrl
    : modelUrl;
  const activeIosSrc: string | null | undefined = variantUrls
    ? variant === 'wrapped'
      ? variantUrls.wrappedIosSrc
      : variantUrls.unwrappedIosSrc
    : iosSrc;
  const quickLookAvailable = !!activeIosSrc;
  // Quick Look reads meters straight from the USDZ and IGNORES `scale`, so a
  // GLB scale note on iPhone would be noise rather than information.
  const showScaleNote = !(ios && quickLookAvailable);

  // The AR screen is ready as soon as `<model-viewer>` can be defined. The
  // three.js scale measurement is deliberately NOT run here: it re-fetches
  // the GLB (the Para Ti scans are 5–15 MB) and races model-viewer's own
  // decode plus the /draco/*.wasm fetch for the decoder — on slow networks
  // that contention surfaces as a late, bogus `error` event. Measuring is
  // lazy instead: it runs once, after the element fires `load` (see the
  // listeners effect below). On timeout/parse error the model still renders
  // — at the authored scale (1) plus a visible warning. The only hard errors
  // left are "model-viewer undefined" and a failed `src` past the grace.
  useEffect(() => {
    let alive = true;
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    loadOkRef.current = false;
    setPhase('loading');
    setErrorKind(null);
    setShowArHint(false);
    setScale(1);
    setScaleState('measuring');
    void loadModelViewer()
      .then((defined) => {
        if (!alive) return;
        if (defined) {
          setPhase('ready');
        } else {
          // Script blocked/offline: the element never defined. Distinct from a
          // decode failure so "Reintentar" can re-inject the script.
          setErrorKind('viewer');
          setPhase('unavailable');
        }
      })
      .catch(() => {
        if (!alive) return;
        setErrorKind('viewer');
        setPhase('unavailable');
      });
    return () => {
      alive = false;
    };
  }, [activeUrl, retryNonce]);

  // model-viewer emits `ar-status` and `load`/`error`; drive the glass
  // surface hint and the lazy scale measurement from them. AR failures stay
  // silent in the UI (console.warn) so the inline 3D preview is never
  // covered — a desktop without WebXR keeps `ready` (preview + native AR
  // button) and only a confirmed `src` load failure shows the error card.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    let alive = true;

    // Best-effort scale: runs ONCE after the decode succeeded, never in
    // parallel with it, so it cannot contend for the GLB/Draco fetch.
    const runMeasure = () => {
      void measureRealScale(activeUrl, targetLongestCm)
        .then((realScale) => {
          if (!alive) return;
          if (realScale === null) {
            setScale(1);
            setScaleState('unverified');
            return;
          }
          setScale(realScale);
          setScaleState('measured');
        })
        .catch(() => {
          if (!alive) return;
          setScale(1);
          setScaleState('unverified');
        });
    };

    const onLoad = () => {
      loadOkRef.current = true;
      // A successful decode cancels any pending false-error grace timer.
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      runMeasure();
    };

    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<ArStatusDetail>).detail;
      const status = detail?.status;
      if (status === 'session-started') {
        setShowArHint(true);
      } else if (status === 'object-placed') {
        setShowArHint(false);
      } else if (status === 'failed') {
        // No WebXR / user dismissed the AR intent: log and keep `ready`.
        console.warn('[ArModelView] AR session failed to start');
        setShowArHint(false);
      } else if (status === 'not-presenting') {
        // Session ended: hide the hint.
        setShowArHint(false);
      }
    };
    interface ModelViewerErrorDetail {
      type?: unknown;
      source?: unknown;
      src?: unknown;
    }
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<ModelViewerErrorDetail>).detail;
      console.warn('[ArModelView] model-viewer error event', detail, activeUrl);
      // Ignore poster/environment/thumbnail failures: they carry their own
      // source and must never take down the model view.
      const rawType = detail?.type;
      const errorType = typeof rawType === 'string' ? rawType.toLowerCase() : '';
      if (
        errorType.includes('poster') ||
        errorType.includes('environment') ||
        errorType.includes('thumbnail')
      ) {
        return;
      }
      const rawSource = detail?.source ?? detail?.src;
      if (typeof rawSource === 'string' && rawSource.length > 0) {
        // Only a failure pointing at the current `src` counts as a model
        // error; anything else (poster, env map) is ignored.
        const fileName = activeUrl.split('/').pop() ?? activeUrl;
        if (
          !rawSource.includes(activeUrl) &&
          !rawSource.includes(fileName) &&
          !activeUrl.includes(rawSource)
        ) {
          return;
        }
      }
      // Already decoded fine → this late/duplicate error (slow network,
      // Draco race) must not flip a working preview into the error card.
      if (loadOkRef.current) return;
      // Grace period: give the in-flight decode a chance to finish before
      // trusting the error. Verified on fire: the element must still be
      // mounted with the same `src` and still not `loaded`.
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      const failedSrc = activeUrl;
      errorTimerRef.current = setTimeout(() => {
        errorTimerRef.current = null;
        if (!alive || loadOkRef.current) return;
        const current = viewerRef.current;
        if (!current) return;
        if (current.getAttribute('src') !== failedSrc) return;
        if ((current as unknown as { loaded?: boolean }).loaded) {
          loadOkRef.current = true;
          return;
        }
        setErrorKind('model');
        setPhase('unavailable');
      }, ERROR_GRACE_MS);
    };
    el.addEventListener('load', onLoad as EventListener);
    el.addEventListener('ar-status', onStatus as EventListener);
    el.addEventListener('error', onError as EventListener);
    // `load` may have fired before the listeners attached (cached decode):
    // measure immediately instead of waiting for an event that already ran.
    try {
      if ((el as unknown as { loaded?: boolean }).loaded) onLoad();
    } catch {
      /* best-effort: the `load` listener still covers the slow path */
    }
    return () => {
      alive = false;
      el.removeEventListener('load', onLoad as EventListener);
      el.removeEventListener('ar-status', onStatus as EventListener);
      el.removeEventListener('error', onError as EventListener);
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [phase, activeUrl, retryNonce, targetLongestCm]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  // "Reintentar": script failures drop the cached loader + failed <script>;
  // model failures just remount the element (same `src`, bumped key). Both
  // bump the nonce so the loader effect re-runs. Pending error timers are
  // dropped so a stale grace cannot kill the fresh attempt.
  const handleRetry = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    loadOkRef.current = false;
    if (errorKind === 'viewer') resetModelViewerLoader();
    // Immediacy: the loader effect also resets on the nonce bump.
    setRetryNonce((n) => n + 1);
  }, [errorKind]);

  // Direct camera launch: model-viewer requires a user gesture, so this
  // explicit button calls activateAR() to jump straight to the camera.
  const handleLaunchAr = useCallback(() => {
    try {
      const el = viewerRef.current as unknown as { activateAR?: () => void } | null;
      el?.activateAR?.();
    } catch {
      /* no-op: inline 3D remains usable */
    }
  }, []);

  // Escape closes the AR overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The modal lives in a portal on document.body (outside the showcase's
  // overflow-x-clip ancestors), so lock the background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Realidad aumentada de ${title}`}
    >
      <div
        className="absolute inset-0 bg-[#2b1a12]/60 dark:bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className="relative z-10 mx-auto flex max-h-[92vh] w-full max-w-full flex-col overflow-hidden overflow-x-hidden rounded-t-3xl border border-[#d4af37]/30 bg-[#fffdf8] shadow-2xl shadow-black/60 sm:max-w-2xl sm:rounded-3xl dark:bg-[#1c100a]"
        style={{ maxHeight: '92dvh' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#d4af37]/20 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-[#d4af37]" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#d4af37]">
                Realidad aumentada
              </p>
              <h3 className="text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar realidad aumentada"
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#d4af37]/30 p-2 text-[#8a6216] transition-all hover:bg-[#f3e7d3] dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
          {variantUrls && (
            <div
              role="group"
              aria-label="Cambiar presentación del modelo"
              className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-[#d4af37]/30 bg-[#f3e7d3]/60 p-1 dark:bg-[#25130b]/70"
            >
              <button
                type="button"
                aria-pressed={variant === 'wrapped'}
                onClick={() => {
                  setVariant('wrapped');
                }}
                className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                  variant === 'wrapped'
                    ? 'bg-gradient-to-r from-[#d4af37] via-[#c0392b] to-[#8a6216] text-white shadow-md shadow-[#c0392b]/30'
                    : 'text-[#8a6216] hover:bg-[#efe0c6] dark:text-[#e5c158] dark:hover:bg-[#2e1910]'
                }`}
              >
                <Package className="h-4 w-4" aria-hidden="true" />
                Con envoltorio
              </button>
              <button
                type="button"
                aria-pressed={variant === 'unwrapped'}
                onClick={() => {
                  setVariant(toggleScannedVariant(variant));
                }}
                className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                  variant === 'unwrapped'
                    ? 'bg-gradient-to-r from-[#4a7c2e] via-[#5c3317] to-[#2e4a1a] text-white shadow-md shadow-[#4a7c2e]/30'
                    : 'text-[#8a6216] hover:bg-[#efe0c6] dark:text-[#e5c158] dark:hover:bg-[#2e1910]'
                }`}
              >
                <PackageOpen className="h-4 w-4" aria-hidden="true" />
                Sin envoltorio
              </button>
            </div>
          )}

          {phase === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="flex h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-[#d4af37]/20 bg-[#f3e7d3]/60 text-sm text-[#5c4433] dark:bg-[#25130b]/60 dark:text-[#e6d5c3]"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4af37] border-t-transparent" />
              <span>Preparando el modelo y detectando superficies…</span>
            </div>
          )}

          {phase === 'unavailable' && (
            <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-[#d4af37]/20 bg-[#f3e7d3]/60 p-6 text-center dark:bg-[#25130b]/60">
              <Box className="h-8 w-8 text-[#d4af37]" aria-hidden="true" />
              <p className="text-sm text-[#5c4433] dark:text-[#e6d5c3]">
                No pudimos cargar el visor de realidad aumentada. Revisá tu conexión o abrí el
                modelo en 3D.
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-1 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#d4af37]/40 bg-[#fdf6e3] px-4 py-2.5 text-xs font-extrabold tracking-wider text-[#8a6216] uppercase transition-all hover:bg-[#f3e7d3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6216] dark:bg-[#2b170e] dark:text-[#e5c158] dark:hover:bg-[#3a1d10]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reintentar
              </button>
            </div>
          )}

          {phase === 'ready' && (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-[radial-gradient(ellipse_at_center,#fff8ea_0%,#f7e8c8_45%,#e8c98a_100%)] dark:bg-[radial-gradient(ellipse_at_center,#4a2a14_0%,#241209_55%,#0e0503_100%)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.28)_0%,transparent_62%)]"
                />
                {/* Fixed natural-size preview box: no visual scaling, so no
                    ghost box is left behind and nothing truncates. */}
                <div style={{ height: 'clamp(300px,52dvh,420px)' }}>
                  <model-viewer
                    key={`${activeUrl}:${retryNonce}`}
                    ref={viewerRef}
                    src={activeUrl}
                    {...(quickLookAvailable ? { 'ios-src': activeIosSrc as string } : {})}
                    {...(poster ? { poster } : {})}
                    ar={true}
                    ar-modes="webxr scene-viewer quick-look"
                    ar-placement="floor"
                    ar-scale="fixed"
                    camera-controls={true}
                    touch-action="pan-y"
                    shadow-intensity="0.55"
                    shadow-softness="0.9"
                    environment-image="neutral"
                    exposure="1.35"
                    scale={`${scale} ${scale} ${scale}`}
                    interaction-prompt="none"
                    loading="lazy"
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                  />
                </div>
                {/* Glass surface hint: visible only during the AR camera session before placement. */}
                {showArHint && (
                  <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 w-max max-w-[240px] -translate-x-1/2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-center text-xs text-white backdrop-blur-xl [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] dark:bg-black/20">
                    Apuntá a una superficie para situar el producto
                  </div>
                )}
              </div>

              {/* Direct camera entry: explicit user gesture jumps to AR. */}
              <button
                type="button"
                onClick={handleLaunchAr}
                className="mt-3 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] to-[#b8860b] px-4 py-3 text-xs font-extrabold tracking-wider text-[#1a0f08] uppercase shadow-lg shadow-[#d4af37]/25 transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6216]"
              >
                <ScanLine className="h-4 w-4" aria-hidden="true" />
                Colocar en mi espacio (abrir cámara)
              </button>

              {/* Scale measurement never blocks the view: it only reports. */}
              {showScaleNote && scaleState !== 'measured' && (
                <p
                  role="status"
                  className="mt-3 rounded-xl border border-[#d4af37]/30 bg-[#fdf6e3] p-3 text-xs text-[#8a6216] dark:bg-[#2b170e] dark:text-[#e5c158]"
                >
                  {scaleState === 'measuring'
                    ? 'Ajustando la escala real del modelo…'
                    : 'No pudimos verificar la escala exacta de este modelo: se usa el tamaño definido en el archivo.'}
                </p>
              )}

              {ios && !quickLookAvailable && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#d4af37]/30 bg-[#f3e7d3] p-3 text-xs text-[#5c4433] dark:bg-[#2b170e] dark:text-[#e6d5c3]">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6216] dark:text-[#e5c158]" aria-hidden="true" />
                  <span>
                    En iPhone la colocación en tu espacio llegará cuando exista la versión{' '}
                    <span className="font-semibold">.usdz</span>. Mientras tanto podés rotar el
                    modelo en 3D aquí mismo.
                  </span>
                </div>
              )}

              {!ios && (
                <p className="mt-3 text-[11px] leading-relaxed text-[#7a5c48] dark:text-[#8e786b]">
                  Apuntá a una superficie plana con buena luz y tocá el botón de AR para anclar
                  el producto (medidas estimadas {dimsLabel}, escala 1:1). Android usa ARCore
                  (WebXR / Scene Viewer); Windows requiere un dispositivo y navegador compatibles con WebXR.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
