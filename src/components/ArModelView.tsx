import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Package, PackageOpen, ScanLine, Smartphone, X } from 'lucide-react';
import { loadModelViewer } from '../utils/modelViewerLoader';
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
/** Best-effort scale measurement: never gates the viewer, only the copy. */
type ScaleState = 'measuring' | 'measured' | 'unverified';

interface ArStatusDetail {
  status?: string;
}

// Display factor for the AR placement and the inline preview: the model is
// drawn at 60% of its measured real size so it reads at the same (smaller)
// size as the showcase thumbnail on phone screens. Applied ONLY at the
// `scale` prop below: the measurement stays keyed to the real
// `targetLongestCm`, and scaling both would compound to 0.36 (64% smaller).
// Quick Look ignores `scale`, so iOS AR keeps its real size (see the notes).
const AR_SCALE_FACTOR = 0.6;

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
 * the measured `scale` times AR_SCALE_FACTOR, so the user cannot deform the
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
  const [scale, setScale] = useState<number>(1);
  const [scaleState, setScaleState] = useState<ScaleState>('measuring');
  const [variant, setVariant] = useState<ScannedVariant>(initialVariant);
  // Glass hint shown only during an active AR session before placement.
  const [showArHint, setShowArHint] = useState<boolean>(false);
  const viewerRef = useRef<HTMLElement | null>(null);

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
  // scale measurement is deliberately decoupled: it re-fetches the GLB (the
  // Para Ti scans are 5–15 MB) and can outlive PRODUCT_MODEL_TIMEOUT_MS, so
  // it must never hold the modal hostage. On timeout/parse error the model
  // still renders — at the authored scale (1) plus a visible warning. The
  // only hard errors left are "model-viewer undefined" and a failed `src`.
  useEffect(() => {
    let alive = true;
    setPhase('loading');
    setShowArHint(false);
    setScale(1);
    setScaleState('measuring');
    void loadModelViewer()
      .then((defined) => {
        if (alive) setPhase(defined ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (alive) setPhase('unavailable');
      });
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
    return () => {
      alive = false;
    };
  }, [activeUrl, targetLongestCm]);

  // model-viewer emits `ar-status`; drive the glass surface hint only.
  // AR failures stay silent in the UI (console.warn) so the inline 3D
  // preview is never covered. The `error` event is the one hard error:
  // it means `<model-viewer>` could not load `src`.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<ArStatusDetail>).detail;
      const status = detail?.status;
      if (status === 'session-started') {
        setShowArHint(true);
      } else if (status === 'object-placed') {
        setShowArHint(false);
      } else if (status === 'failed') {
        console.warn('[ArModelView] AR session failed to start');
        setShowArHint(false);
      } else if (status === 'not-presenting') {
        // Session ended: hide the hint.
        setShowArHint(false);
      }
    };
    const onError = () => {
      setPhase('unavailable');
    };
    el.addEventListener('ar-status', onStatus as EventListener);
    el.addEventListener('error', onError as EventListener);
    return () => {
      el.removeEventListener('ar-status', onStatus as EventListener);
      el.removeEventListener('error', onError as EventListener);
    };
  }, [phase, activeUrl]);

  const handleClose = useCallback(() => onClose(), [onClose]);

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

  return (
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
      <div className="relative z-10 mx-auto flex max-h-[100dvh] w-full max-w-full flex-col overflow-hidden overflow-x-hidden rounded-t-3xl border border-[#d4af37]/30 bg-[#fffdf8] shadow-2xl shadow-black/60 sm:max-h-[92vh] sm:max-w-2xl sm:rounded-3xl dark:bg-[#1c100a]">
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

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
          {variantUrls && (
            <div
              role="group"
              aria-label="Cambiar presentación del modelo"
              className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-[#d4af37]/30 bg-[#f3e7d3]/60 p-1 dark:bg-[#25130b]/70"
            >
              <button
                type="button"
                aria-pressed={variant === 'wrapped'}
                onClick={() => setVariant('wrapped')}
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
                onClick={() => setVariant(toggleScannedVariant(variant))}
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
            </div>
          )}

          {phase === 'ready' && (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-[radial-gradient(ellipse_at_center,#fff8ea_0%,#f7e8c8_45%,#e8c98a_100%)] dark:bg-[radial-gradient(ellipse_at_center,#4a2a14_0%,#241209_55%,#0e0503_100%)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.28)_0%,transparent_62%)]"
                />
                <div style={{ transform: `scale(${AR_SCALE_FACTOR})`, transformOrigin: 'center' }}>
                  <model-viewer
                    key={activeUrl}
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
                    scale={String(scale * AR_SCALE_FACTOR)}
                    interaction-prompt="none"
                    loading="lazy"
                    style={{ width: '100%', height: 'clamp(300px, 52dvh, 420px)', backgroundColor: 'transparent' }}
                  />
                </div>
                {/* Glass surface hint: visible only during the AR camera session before placement. */}
                {showArHint && (
                  <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 w-max max-w-[240px] -translate-x-1/2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-center text-xs text-white backdrop-blur-xl [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] dark:bg-black/20">
                    Apuntá a una superficie para situar el producto
                  </div>
                )}
              </div>

              <p className="mt-2 text-center text-[11px] leading-relaxed text-[#7a5c48] dark:text-[#8e786b]">
                Vista previa ajustada al tamaño de visualización
              </p>

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
                    : 'No pudimos verificar la escala exacta de este modelo: se muestra al 60% de su tamaño original (aproximado).'}
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
                  el producto (medidas reales {dimsLabel}; se muestra al 60%, igual que la
                  miniatura). Android usa ARCore (WebXR / Scene Viewer).
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
