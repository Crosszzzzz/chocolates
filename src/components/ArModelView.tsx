import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, ScanLine, Smartphone, X } from 'lucide-react';
import { loadModelViewer } from '../utils/modelViewerLoader';
import { loadModelFromUrl } from '../utils/glbProduct';
import { BAR_LONGEST_CM } from '../utils/scannedModels';

interface ArModelViewProps {
  /** Percent-encoded GLB url (the packaged/`wrapped` scan). */
  modelUrl: string;
  /** Product name shown in the header. */
  title: string;
  /** Optional iOS Quick Look asset; when absent quick-look is disabled. */
  iosSrc?: string | null;
  onClose: () => void;
}

type Phase = 'loading' | 'ready' | 'unavailable';

interface ArStatusDetail {
  status?: string;
}

// The scanned model is small (~452 KB) and AR is an explicit user action, so we
// measure it once with three to derive the true real-size scale for
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
 * placement) and anchors the bar at true size. Degrades gracefully — no WebGL,
 * blocked CDN or iPhone without a `.usdz` never yield a broken screen.
 */
export const ArModelView: React.FC<ArModelViewProps> = ({ modelUrl, title, iosSrc, onClose }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [scale, setScale] = useState<number>(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);

  const ios = isIosDevice();
  const quickLookAvailable = !!iosSrc;

  useEffect(() => {
    let alive = true;
    void Promise.all([loadModelViewer(), measureRealScale(modelUrl)]).then(([defined, realScale]) => {
      if (!alive) return;
      setScale(realScale);
      setPhase(defined ? 'ready' : 'unavailable');
    });
    return () => {
      alive = false;
    };
  }, [modelUrl]);

  // model-viewer emits `ar-status`; surface failures as a friendly note instead
  // of letting the native AR attempt fail silently.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<ArStatusDetail>).detail;
      if (detail?.status === 'failed') {
        setStatusMessage(
          'No pudimos iniciar la realidad aumentada en este dispositivo. Podés explorar el modelo en 3D.',
        );
      }
    };
    el.addEventListener('ar-status', onStatus as EventListener);
    return () => el.removeEventListener('ar-status', onStatus as EventListener);
  }, [phase]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-[#2b1a12]/60 dark:bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[#d4af37]/30 bg-[#fffdf8] dark:bg-[#1c100a] shadow-2xl shadow-black/60">
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
            className="shrink-0 rounded-lg border border-[#d4af37]/30 p-2 text-[#8a6216] transition-all hover:bg-[#f3e7d3] dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
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
              <div className="overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-gradient-to-b from-[#faf6ef] to-[#eeddc0] dark:from-[#180b06] dark:to-[#0d0503]">
                <model-viewer
                  ref={viewerRef}
                  src={modelUrl}
                  {...(quickLookAvailable ? { 'ios-src': iosSrc as string } : {})}
                  ar={true}
                  ar-modes="webxr scene-viewer quick-look"
                  ar-placement="floor"
                  camera-controls={true}
                  touch-action="pan-y"
                  shadow-intensity="1"
                  shadow-softness="0.8"
                  environment-image="neutral"
                  exposure="1"
                  scale={String(scale)}
                  interaction-prompt="none"
                  style={{ width: '100%', height: '360px', backgroundColor: 'transparent' }}
                />
              </div>

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
                  Toca el botón de AR para anclar la barra (15 × 7.2 × 0.8 cm) sobre una superficie
                  plana. Android usa ARCore (WebXR / Scene Viewer).
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
