import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Box, Cuboid, ScanLine, Timer } from 'lucide-react';
import { loadWrapState, type WrapState } from '../utils/wrapper';
import { resolveProductModelUrl } from '../utils/glbProduct';
import {
  AR_REFERENCE_SCALE_M,
  HOLD_TO_PLACE_MS,
  checkUsdzAvailable,
  isImmersiveArSupported,
  resolveUsdzUrl,
} from '../utils/arExperience';

interface ArExperienceViewProps {
  sku: string;
  onBackToChamber: () => void;
}

type XrStatus = 'checking' | 'supported' | 'unsupported';

const WRAP_LABEL: Record<WrapState, string> = {
  wrapped: 'Envuelto',
  peeking: 'Entreabierto',
  unwrapped: 'Desenvuelto',
};

export const ArExperienceView: React.FC<ArExperienceViewProps> = ({ sku, onBackToChamber }) => {
  const [xrStatus, setXrStatus] = useState<XrStatus>('checking');
  const [usdzAvailable, setUsdzAvailable] = useState<boolean>(false);
  const [placed, setPlaced] = useState<boolean>(false);
  const [autoPlace, setAutoPlace] = useState<boolean>(false);
  // M4 continuity: resume the persisted wrap state for this sku (read-only here).
  const [wrapState] = useState<WrapState | null>(() => {
    try {
      return loadWrapState(sku);
    } catch {
      return null;
    }
  });

  const holdTimer = useRef<number | null>(null);

  const usdzUrl = resolveUsdzUrl(sku);
  const glbUrl = resolveProductModelUrl(sku);

  // Capability detection: WebXR immersive-ar (guarded, never throws) + USDZ
  // HEAD check (link renders only when the file actually exists).
  useEffect(() => {
    let alive = true;
    void isImmersiveArSupported()
      .then((supported) => {
        if (alive) setXrStatus(supported ? 'supported' : 'unsupported');
      })
      .catch(() => {
        if (alive) setXrStatus('unsupported');
      });
    void checkUsdzAvailable(usdzUrl)
      .then((ok) => {
        if (alive) setUsdzAvailable(ok);
      })
      .catch(() => {
        if (alive) setUsdzAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, [usdzUrl]);

  // Auto-place: put the anchor down as soon as AR is ready, without holding.
  useEffect(() => {
    if (autoPlace && xrStatus === 'supported' && !placed) {
      setPlaced(true);
    }
  }, [autoPlace, xrStatus, placed]);

  // Hold-1s-to-place timer cleanup on unmount.
  useEffect(
    () => () => {
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    },
    [],
  );

  const cancelHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const startHold = () => {
    cancelHold();
    holdTimer.current = window.setTimeout(() => {
      setPlaced(true);
      holdTimer.current = null;
    }, HOLD_TO_PLACE_MS);
  };

  return (
    <div className="relative w-full h-screen overflow-y-auto bg-gradient-to-b from-[#180b06] via-[#1f0e08] to-[#0d0503] select-none">
      <div className="max-w-2xl mx-auto px-4 pt-24 pb-16 flex flex-col gap-4">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs uppercase font-extrabold tracking-widest text-[#d4af37]">
            Realidad aumentada
          </p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[#fcf8f2] font-serif-luxury">
            Coloca tu chocolate en tu mesa
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-[#d7c4b7]">
            Producto <span className="font-bold text-[#f1c40f]">{sku}</span>
            {' · '}Estado del envoltorio:{' '}
            <span className="font-bold text-[#f1c40f]">
              {wrapState ? WRAP_LABEL[wrapState] : 'Sin estado guardado'}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-[#8e786b]">
            Escala de referencia del producto: {AR_REFERENCE_SCALE_M.toFixed(3)} m
          </p>
        </div>

        {/* Capability / fallback card */}
        {xrStatus === 'checking' && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl bg-[#1c100a]/95 border border-[#d4af37]/30 p-5 text-center text-sm text-[#e6d5c3]"
          >
            Comprobando si tu dispositivo admite realidad aumentada…
          </div>
        )}

        {xrStatus === 'unsupported' && (
          <div className="rounded-2xl bg-[#1c100a]/95 border border-[#d4af37]/30 p-5 sm:p-6 shadow-2xl shadow-black/60">
            <div className="flex items-start gap-3">
              <Box className="w-6 h-6 shrink-0 text-[#d4af37]" aria-hidden="true" />
              <div>
                <h3 className="text-base font-bold text-[#fcf8f2]">
                  Tu dispositivo no admite realidad aumentada
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#d7c4b7]">
                  No encontramos soporte de WebXR (AR) en este navegador. Para ver el
                  chocolate en tu mesa necesitas un móvil Android con ARCore o un iPhone
                  con iOS 12 o superior.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#d7c4b7]">
                  Vista previa 3D integrada: puedes seguir explorando el producto en la
                  sala con su modelo 3D (
                  <span className="font-mono text-[#e5c158]">{glbUrl}</span>
                  {usdzAvailable ? (
                    <>
                      {' '}y su versión para iOS (
                      <span className="font-mono text-[#e5c158]">{usdzUrl}</span>)
                    </>
                  ) : (
                    ' — sin archivo USDZ disponible por ahora'
                  )}
                  ).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBackToChamber}
              aria-label="Volver a la sala real"
              className="mt-4 w-full min-h-[44px] px-4 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#d4af37]/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Volver a la sala real</span>
            </button>
          </div>
        )}

        {xrStatus === 'supported' && (
          <div className="rounded-2xl bg-[#1c100a]/95 border border-[#22c55e]/30 p-5 sm:p-6 shadow-2xl shadow-black/60">
            <div className="flex items-start gap-3">
              <ScanLine className="w-6 h-6 shrink-0 text-[#4ade80]" aria-hidden="true" />
              <div>
                <h3 className="text-base font-bold text-[#fcf8f2]">
                  {placed ? '¡Producto colocado!' : 'Apunta a una superficie plana'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#d7c4b7]">
                  {placed
                    ? `El ancla del producto está fija a escala de referencia (${AR_REFERENCE_SCALE_M.toFixed(3)} m). Muévete alrededor para verlo en tamaño real.`
                    : 'Mantén pulsado el botón durante 1 segundo para colocar el chocolate, o activa la colocación automática.'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {!placed && (
                <button
                  type="button"
                  onPointerDown={startHold}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  onPointerCancel={cancelHold}
                  aria-label="Mantén pulsado un segundo para colocar el producto"
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#d4af37]/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 touch-none select-none"
                >
                  <Timer className="w-4 h-4" aria-hidden="true" />
                  <span>Mantén 1 s para colocar</span>
                </button>
              )}

              {placed && (
                <p role="status" className="text-xs text-[#4ade80] font-bold text-center">
                  Ancla colocada correctamente.
                </p>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={autoPlace}
                aria-label="Activar colocación automática"
                onClick={() => setAutoPlace((v) => !v)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#2e1910] hover:bg-[#3d2215] text-[#e5c158] font-bold text-xs border border-[#d4af37]/30 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Cuboid className="w-4 h-4" aria-hidden="true" />
                <span>Colocación automática: {autoPlace ? 'activada' : 'desactivada'}</span>
              </button>

              <button
                type="button"
                onClick={onBackToChamber}
                aria-label="Volver a la sala real"
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-transparent text-[#e5c158] font-bold text-xs border border-[#d4af37]/30 hover:bg-[#2b170e] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Volver a la sala real</span>
              </button>
            </div>
          </div>
        )}

        {/* iOS Quick Look: rendered ONLY after the HEAD check proves the file exists. */}
        {usdzAvailable && (
          <div className="rounded-2xl bg-[#1c100a]/95 border border-[#d4af37]/30 p-5 text-center">
            <p className="text-xs text-[#d7c4b7]">
              ¿Usas iPhone? Ábrelo con Vista Rápida de iOS:
            </p>
            <a
              rel="ar"
              href={usdzUrl}
              aria-label="Ver el producto en realidad aumentada con iPhone"
              className="mt-2 inline-flex min-h-[44px] items-center px-5 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#d4af37]/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Ver en mi espacio (iOS)
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
