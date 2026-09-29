import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Rotate3d, ScanLine, ShoppingCart } from 'lucide-react';
import type { ProductSpec } from '../types/chocolate';
import { buildShowcaseCards, toggleOpenSku, addToCartButtonState, type ShowcaseCard } from '../utils/productShowcase';
import { resolveProductScannedModels, resolveScannedModelUrl } from '../utils/scannedModels';
import { useCart } from '../contexts/CartContext';
import type { CatalogMap } from './CartDrawer';
import { ArModelView } from './ArModelView';
import { ScannedModel3DViewer } from './ScannedModel3DViewer';

interface ProductShowcaseProps {
  products: ProductSpec[];
  /**
   * Products without a scanned model (e.g. bombones boxes) keep the current
   * render: selecting them opens the existing detail/unwrap flow.
   */
  onOpenLegacy: (product: ProductSpec) => void;
  /** Live price/stock per SKU (App's catalogMap). Missing SKU = out of stock. */
  catalog: CatalogMap;
  /** Optional: App opens the cart drawer right after a successful add. */
  onAdded?: () => void;
}

/** CSS-only chocolate-bar miniature driven by the product's brand palette. */
const BarThumbnail: React.FC<{ card: ShowcaseCard }> = ({ card }) => (
  <div
    className="relative mx-auto flex h-24 w-40 items-center justify-center overflow-hidden rounded-xl border shadow-inner"
    style={{ backgroundColor: card.thumbnail.base, borderColor: 'rgba(212,175,55,0.5)' }}
    aria-hidden="true"
  >
    <div
      className="grid h-16 w-24 grid-cols-3 grid-rows-5 gap-[3px] rounded-md p-1"
      style={{ backgroundColor: card.thumbnail.cacao }}
    >
      {Array.from({ length: 15 }).map((_, i) => (
        <span
          key={i}
          className="rounded-[2px]"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        />
      ))}
    </div>
    <span
      className="absolute bottom-1.5 h-1 w-32 rounded-full opacity-90"
      style={{ backgroundColor: card.thumbnail.accent }}
    />
  </div>
);

/**
 * Redesigned product presentation: a thumbnail + name card per product. Cards
 * with a scanned model expand into a small panel offering exactly two actions
 * (AR / 3D); the rest keep their current render via `onOpenLegacy`.
 */
export const ProductShowcase: React.FC<ProductShowcaseProps> = ({ products, onOpenLegacy, catalog, onAdded }) => {
  const cards = useMemo(() => buildShowcaseCards(products), [products]);
  const [openSku, setOpenSku] = useState<string | null>(null);
  const [arProduct, setArProduct] = useState<ProductSpec | null>(null);
  const [modelProduct, setModelProduct] = useState<ProductSpec | null>(null);
  const { add } = useCart();

  const productBySku = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  return (
    <div className="w-full">
      <h2 className="mb-4 text-center text-xs font-extrabold uppercase tracking-[0.3em] text-[#d4af37]">
        Elegí tu chocolate
      </h2>

      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const product = productBySku.get(card.sku);
          if (!product) return null;
          const isOpen = openSku === card.sku;
          const expandable = card.hasAr || card.has3d;
          const stock = catalog[card.sku]?.stock ?? 0;
          const addState = addToCartButtonState(stock);

          return (
            <div
              key={card.sku}
              className="overflow-hidden rounded-2xl border border-[#d4af37]/25 bg-[#fffdf8]/92 backdrop-blur-md shadow-xl shadow-black/10 dark:bg-[#1c100a]/92 dark:shadow-black/40"
            >
              <button
                type="button"
                aria-expanded={expandable ? isOpen : undefined}
                onClick={() =>
                  expandable ? setOpenSku((cur) => toggleOpenSku(cur, card.sku)) : onOpenLegacy(product)
                }
                className="flex w-full cursor-pointer flex-col items-center gap-3 p-4 transition-colors hover:bg-[#f3e7d3]/70 dark:hover:bg-[#2b170e]/70"
              >
                {card.hasAr && (
                  <span className="flex items-center gap-1 self-end rounded-full border border-[#d4af37]/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a6216] dark:text-[#e5c158]">
                    <ScanLine className="h-3 w-3" aria-hidden="true" /> AR
                  </span>
                )}
                <BarThumbnail card={card} />
                <span className="flex items-center gap-1.5 text-center text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2]">
                  {card.name}
                  {expandable && (
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#d4af37] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {expandable && isOpen && (
                  <motion.div
                    key="panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 border-t border-[#d4af37]/20 p-3">
                      <button
                        type="button"
                        disabled={addState.disabled}
                        onClick={() => {
                          add(card.sku, stock);
                          onAdded?.();
                        }}
                        className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] to-[#b8860b] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[#1a0f08] shadow-lg shadow-[#d4af37]/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                      >
                        <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                        {addState.label}
                      </button>
                      {card.hasAr && (
                        <button
                          type="button"
                          onClick={() => setArProduct(product)}
                          className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] to-[#b8860b] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[#1a0f08] shadow-lg shadow-[#d4af37]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <ScanLine className="h-4 w-4" aria-hidden="true" />
                          Ver en realidad aumentada
                        </button>
                      )}
                      {card.has3d && (
                        <button
                          type="button"
                          onClick={() => setModelProduct(product)}
                          className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d4af37]/40 bg-[#efe0c6] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[#8a6216] transition-all hover:bg-[#e2cda4] active:scale-[0.98] dark:bg-[#2e1910] dark:text-[#e5c158] dark:hover:bg-[#3d2215]"
                        >
                          <Rotate3d className="h-4 w-4" aria-hidden="true" />
                          Ver en 3D
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenSku(null)}
                        className="min-h-[36px] cursor-pointer rounded-xl px-4 py-1.5 text-[11px] font-bold text-[#7a5c48] transition-colors hover:text-[#2b1a12] dark:text-[#a08575] dark:hover:text-[#fcf8f2]"
                      >
                        Cerrar
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {arProduct && (
        <ArModelView
          modelUrl={resolveScannedModelUrl('wrapped')}
          title={arProduct.name}
          onClose={() => setArProduct(null)}
        />
      )}
      {modelProduct && (
        <ScannedModel3DViewer
          modelUrl={resolveScannedModelUrl('unwrapped')}
          title={modelProduct.name}
          onClose={() => setModelProduct(null)}
        />
      )}
    </div>
  );
};
