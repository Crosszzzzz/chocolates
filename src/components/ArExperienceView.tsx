import React, { useEffect, useState } from 'react';
import { ArrowLeft, Box } from 'lucide-react';
import type { ProductSpec } from '../types/chocolate';
import {
  checkUsdzAvailable,
  resolveUsdzUrl,
} from '../utils/arExperience';
import { resolveProductScannedModels, resolveScannedModelUrl } from '../utils/scannedModels';
import { ArModelView } from './ArModelView';

interface ArExperienceViewProps {
  product: ProductSpec;
  onBackToChamber: () => void;
}

/**
 * Full-screen AR stage reached from the unwrap/detail flow. Real AR (surface
 * detection + floor anchoring at true size) is delegated to `<model-viewer>`
 * via `ArModelView`. Products without a scanned model keep a graceful message.
 */
export const ArExperienceView: React.FC<ArExperienceViewProps> = ({ product, onBackToChamber }) => {
  const scanned = resolveProductScannedModels(product);
  const [usdzAvailable, setUsdzAvailable] = useState<boolean>(false);

  // iOS Quick Look needs a .usdz sibling; when the file exists the AR view
  // wires it automatically, otherwise iPhone users get an elegant note.
  useEffect(() => {
    let alive = true;
    void checkUsdzAvailable(resolveUsdzUrl(product.id))
      .then((ok) => {
        if (alive) setUsdzAvailable(ok);
      })
      .catch(() => {
        if (alive) setUsdzAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, [product.id]);

  if (!scanned) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center overflow-y-auto bg-gradient-to-b from-[#faf6ef] via-[#f5ead6] to-[#eeddc0] px-4 dark:from-[#180b06] dark:via-[#1f0e08] dark:to-[#0d0503]">
        <div className="w-full max-w-md rounded-2xl border border-[#d4af37]/30 bg-[#fffdf8]/95 p-6 text-center shadow-2xl shadow-black/40 dark:bg-[#1c100a]/95">
          <Box className="mx-auto h-8 w-8 text-[#d4af37]" aria-hidden="true" />
          <h3 className="mt-3 text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">
            Realidad aumentada disponible para las barras
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[#5c4433] dark:text-[#d7c4b7]">
            Este producto todavía no tiene un modelo escaneado para colocar en tu espacio. Podés
            seguir viéndolo con su render habitual.
          </p>
          <button
            type="button"
            onClick={onBackToChamber}
            className="mt-4 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] to-[#b8860b] px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[#1a0f08] shadow-lg shadow-[#d4af37]/25 transition-all hover:scale-[1.02] active:scale-[0.98] dark:via-[#f1c40f]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la sala real</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full bg-gradient-to-b from-[#faf6ef] via-[#f5ead6] to-[#eeddc0] dark:from-[#180b06] dark:via-[#1f0e08] dark:to-[#0d0503]">
      <ArModelView
        modelUrl={resolveScannedModelUrl(scanned.ar)}
        title={product.name}
        iosSrc={usdzAvailable ? resolveUsdzUrl(product.id) : null}
        dimensions={product.dimensions}
        onClose={onBackToChamber}
      />
    </div>
  );
};
