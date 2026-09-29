import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Package, PackageOpen, ScanLine, Smartphone, X } from 'lucide-react';
import { loadModelViewer } from '../utils/modelViewerLoader';
import { loadModelFromUrl } from '../utils/glbProduct';
import { BAR_LONGEST_CM, toggleScannedVariant, type ScannedVariant } from '../utils/scannedModels';

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
  onClose: () => void;
}

type Phase = 'loading' | 'ready' | 'unavailable';

interface ArStatusDetail {
  status?: string;
}

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

async function measureRealScale(url: string): Promise<number> {
  const cached = scaleCache.get(url);
  if (cached !== undefined) return cached;
  const loaded = await loadModelFromUrl(url, { targetLongestCm: BAR_LONGEST_CM });
  if (!loaded) return 1;
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
  scaleCache.set(url, scale);
  return scale;
}

/**
 * AR view backed by `<model-viewer>`: detects a real-world surface (`floor`
 * placement) and anchors the bar at true size (`fixed` scale locked to the
 * measured `scale`, so the user cannot deform the 15 x 7.2 x 0.8 cm bar).
 * Degrades gracefully — no WebGL, blocked CDN or missing `.usdz` never yield
 * a broken screen.
 */
export const ArModelView: React.FC<ArModelViewProps> = ({
  modelUrl,
  title,
  iosSrc,
  variantUrls,
  initialVariant = 'wrapped',
  onClose,
}) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [scale, setScale] = useState<number>(1);
  const [variant, setVariant] = useState<ScannedVariant>(initialVariant);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);

  const ios = isIosDevice();

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

  useEffect(() => {
    let alive = true;
    setPhase('loading');
    setStatusMessage(null);
    void Promise.all([loadModelViewer(), measureRealScale(activeUrl)]).then(([defined, realScale]) => {
      if (!alive) return;
      setScale(realScale);
      setPhase(defined ? 'ready' : 'unavailable');
    });
    return () => {
      alive = false;
    };
  }, [activeUrl]);

  // model-viewer emits `ar-status`; surface failures as a friendly note instead
  // of letting the native AR attempt fail silently. The `error` event covers
  // model load failures with the same kind tone.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<ArStatusDetail>).detail;
      if (detail?.status === 'failed') {
        setStatusMessage(
          'No pudimos iniciar la realidad aumentada en este dispositivo. Probá en otra superficie con buena luz o explorá el modelo en 3D.',
        );
      }
    };
    const onError = () => {
      setStatusMessage(
        'No pudimos cargar el modelo para AR. Revisá tu conexión e intentá de nuevo.',
      );
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
                <model-viewer
                  key={activeUrl}
                  ref={viewerRef}
                  src={activeUrl}
                  {...(quickLookAvailable ? { 'ios-src': activeIosSrc as string } : {})}
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
                  scale={String(scale)}
                  interaction-prompt="none"
                  style={{ width: '100%', height: 'clamp(300px, 52dvh, 420px)', backgroundColor: 'transparent' }}
                />
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

              {ios && quickLookAvailable && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#d4af37]/30 bg-[#f3e7d3] p-3 text-xs text-[#5c4433] dark:bg-[#2b170e] dark:text-[#e6d5c3]">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6216] dark:text-[#e5c158]" aria-hidden="true" />
                  <span>
                    En iPhone la colocación usa Vista rápida (Quick Look) con la versión{' '}
                    <span className="font-semibold">.usdz</span> a escala real (15 × 7.2 ×
                    0.8 cm).
                  </span>
                </div>
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
                  la barra (15 × 7.2 × 0.8 cm) a escala real. Android usa ARCore (WebXR / Scene
                  Viewer).
                </p>
              )}

              {statusMessage && (
                <p role="alert" className="mt-3 rounded-xl bg-[#fdecea] p-3 text-xs text-[#b3261e] dark:bg-[#3a1512] dark:text-[#f0a6a6]">
                  {statusMessage}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
