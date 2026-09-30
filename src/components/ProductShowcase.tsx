import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ScanLine } from 'lucide-react';
import type { ProductSpec } from '../types/chocolate';
import { buildShowcaseCards, type ShowcaseCard } from '../utils/productShowcase';
import { resolveProductAssets } from '../data/productAssets';
import type { CatalogMap } from './CartDrawer';
import { ArModelView } from './ArModelView';
import { ScannedModel3DViewer } from './ScannedModel3DViewer';
import { ProductDetailDrawer } from './ProductDetailDrawer';

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
  /** Optional: notifies the parent (Sala) when the detail drawer opens/closes
      so it can re-center its content in the space left of the drawer. */
  onDrawerChange?: (open: boolean) => void;
}

// Per-product AR/3D assets resolve through `resolveProductAssets(sku)` at
// render time (see the modals below): bars share the scanned captures today,
// and a future per-SKU drop-in only touches `src/data/productAssets.ts`.

/** CSS-only chocolate-bar miniature driven by the product's brand palette. */
const BarThumbnail: React.FC<{ card: ShowcaseCard }> = ({ card }) => (
  <div
    className="relative mx-auto flex h-32 w-52 items-center justify-center overflow-hidden rounded-xl border shadow-inner"
    style={{ backgroundColor: card.thumbnail.base, borderColor: 'rgba(212,175,55,0.5)' }}
    aria-hidden="true"
  >
    <div
      className="grid h-20 w-32 grid-cols-3 grid-rows-5 gap-[3px] rounded-md p-1"
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
      className="absolute bottom-1.5 h-1 w-40 rounded-full opacity-90"
      style={{ backgroundColor: card.thumbnail.accent }}
    />
  </div>
);

/**
 * Real product packshot with graceful fallback: when the photo cannot load,
 * the brand-palette CSS miniature takes its place so the card never breaks.
 * The image uses object-contain on a solid radial backdrop (never a
 * checkerboard), so transparent PNGs render clean without overlapping badges.
 */
const ProductPhoto: React.FC<{ card: ShowcaseCard }> = ({ card }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return <BarThumbnail card={card} />;
  return (
    <img
      src={card.photoUrl}
      alt={`Foto de ${card.name}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="relative z-0 mx-auto h-full max-h-72 w-full max-w-full scale-[1.18] object-contain drop-shadow-[0_10px_16px_rgba(43,26,18,0.25)] transition-transform duration-300 group-hover:scale-[1.25] sm:max-h-80 dark:drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
    />
  );
};

/**
 * Boutique product presentation: a packshot photo + name card per product.
 * Pressing a card with a scanned model opens the right-side detail drawer
 * (photo, description, cacao/weight, price/stock, qty + the 3 shared actions);
 * the rest keep their current render via `onOpenLegacy`. Empty grid space,
 * backdrop, X or Escape closes the drawer.
 */
export const ProductShowcase: React.FC<ProductShowcaseProps> = ({ products, onOpenLegacy, catalog, onAdded, onDrawerChange }) => {
  const cards = useMemo(() => buildShowcaseCards(products), [products]);
  // Single drawer selection (replaces the old per-card expandable panel).
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [arProduct, setArProduct] = useState<ProductSpec | null>(null);
  const [modelProduct, setModelProduct] = useState<ProductSpec | null>(null);

  const productBySku = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedCard = selectedSku ? (cards.find((c) => c.sku === selectedSku) ?? null) : null;
  const selectedProduct = selectedSku ? (productBySku.get(selectedSku) ?? null) : null;
  const drawerOpen = selectedCard !== null && selectedProduct !== null;

  const closeDrawer = () => setSelectedSku(null);

  // Notify the parent Sala so it can center itself in the free space.
  useEffect(() => {
    onDrawerChange?.(drawerOpen);
  }, [drawerOpen, onDrawerChange]);

  // Escape closes the drawer when no modal (AR/3D) is on top.
  useEffect(() => {
    if (!selectedSku || arProduct || modelProduct) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedSku(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedSku, arProduct, modelProduct]);

  // Global background close: any pointerdown outside the drawer closes it.
  // Card presses swap content instead (ignored here, handled by the card
  // onClick), and clicks inside the drawer or any dialog (AR/3D modals,
  // cart, auth) never close. Disabled while a modal is on top so the
  // drawer stays open behind it. SKU swaps keep the stable drawer key,
  // so they crossfade in place without re-animating.
  useEffect(() => {
    if (!drawerOpen || arProduct || modelProduct) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('[data-product-detail-drawer]')) return;
      if (target.closest('[data-showcase-card]')) return;
      if (target.closest('[role="dialog"]')) return;
      setSelectedSku(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [drawerOpen, arProduct, modelProduct]);

  // Click on empty grid space (not on a card) closes the drawer.
  const handleGridEmptyClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeDrawer();
  };

  return (
    <div className="w-full overflow-x-clip" onClick={handleGridEmptyClick}>
      <h2 className="mb-1 text-center text-xs font-extrabold uppercase tracking-[0.3em] text-[#d4af37]">
        Elegí tu chocolate
      </h2>
      <p className="mb-5 text-center font-serif-luxury text-sm italic text-[#7a5c48] dark:text-[#bda393]">
        Selección de la casa, a escala real en tu espacio
      </p>

      <div
        className="mx-auto grid w-full max-w-4xl grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3"
        onClick={handleGridEmptyClick}
      >
        {cards.map((card) => {
          const product = productBySku.get(card.sku);
          if (!product) return null;
          const expandable = card.hasAr || card.has3d;
          const entry = catalog[card.sku];
          const stock = entry?.stock ?? 0;
          const price = entry?.priceBOB;
          const selected = selectedSku === card.sku;

          return (
            <div
              key={card.sku}
              data-showcase-card={card.sku}
              className="group flex h-full flex-col overflow-hidden rounded-3xl border border-[#d4af37]/25 bg-[#fffdf8]/95 shadow-xl shadow-black/10 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#d4af37]/20 dark:bg-[#1c100a]/95 dark:shadow-black/50 dark:hover:shadow-[#d4af37]/10"
            >
              <button
                type="button"
                aria-haspopup={expandable ? 'dialog' : undefined}
                aria-expanded={expandable ? selected : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (expandable) setSelectedSku(card.sku);
                  else onOpenLegacy(product);
                }}
                className="flex w-full flex-1 cursor-pointer flex-col p-4 pb-3 text-left transition-colors hover:bg-[#f3e7d3]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6216] dark:hover:bg-[#2b170e]/50"
              >
                <span className="relative mb-2 block aspect-square w-full overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_center,#fbf3e2_0%,#f3e7d3_55%,#e9d4ae_100%)] sm:aspect-[4/5] dark:bg-[radial-gradient(ellipse_at_center,#2b170e_0%,#1c100a_60%,#120906_100%)]">
                  {card.badge && (
                    <span className="absolute top-2 left-2 z-10 max-w-[62%] truncate rounded-full bg-gradient-to-r from-[#d4af37] to-[#b8860b] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#1a0f08] shadow-md">
                      {card.badge}
                    </span>
                  )}
                  {card.hasAr && (
                    <span className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full border border-[#d4af37]/40 bg-[#fffdf8]/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#8a6216] shadow-sm dark:bg-[#1c100a]/90 dark:text-[#e5c158]">
                      <ScanLine className="h-3 w-3" aria-hidden="true" /> AR
                    </span>
                  )}
                  <span className="flex h-full w-full items-center justify-center px-1 pt-6 pb-1">
                    <ProductPhoto card={card} />
                  </span>
                </span>
                <span className="block min-h-[2.5em] font-serif-luxury text-sm leading-tight font-bold text-[#2b1a12] line-clamp-2 dark:text-[#fcf8f2]">
                  {card.name}
                </span>
                <span
                  className="mt-0.5 block min-h-[2em] text-[11px] leading-tight text-[#7a5c48] line-clamp-2 dark:text-[#bda393]"
                  title={card.subtitle}
                >
                  {card.subtitle}
                </span>
                <span className="mt-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#8a6216] dark:text-[#e5c158]">
                  <span>{card.cacaoPercentage}% cacao</span>
                  <span aria-hidden="true" className="text-[#d4af37]">·</span>
                  <span>{card.weight}</span>
                </span>
                <span className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-[#2b1a12] dark:text-[#fcf8f2]">
                    {price !== undefined ? `Bs ${price.toFixed(2)}` : 'Precio en tienda'}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7a5c48] dark:text-[#a08575]">
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${stock > 0 ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-[#b3261e] dark:bg-[#f0a6a6]'}`}
                    />
                    {stock > 0 ? `${stock} disponibles` : 'Sin stock'}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Right-side detail drawer: stable key so SKU swaps replace
          content inside (soft crossfade) instead of exit+enter slide.
          Empty grid space, X, backdrop (mobile) and Escape still close. */}
      <AnimatePresence initial={false}>
        {selectedCard && selectedProduct && (
          <ProductDetailDrawer
            key="product-detail-drawer"
            card={selectedCard}
            product={selectedProduct}
            catalog={catalog}
            onClose={closeDrawer}
            onOpenAr={() => {
              const p = productBySku.get(selectedCard.sku);
              if (p) setArProduct(p);
            }}
            onOpen3d={() => {
              const p = productBySku.get(selectedCard.sku);
              if (p) setModelProduct(p);
            }}
            onAdded={onAdded}
          />
        )}
      </AnimatePresence>

      {arProduct &&
        (() => {
          const assets = resolveProductAssets(arProduct.id);
          if (!assets.wrappedGlb) return null;
          return (
            <ArModelView
              modelUrl={assets.wrappedGlb}
              title={arProduct.name}
              iosSrc={assets.wrappedUsdz ?? null}
              variantUrls={
                assets.unwrappedGlb
                  ? {
                      wrappedUrl: assets.wrappedGlb,
                      unwrappedUrl: assets.unwrappedGlb,
                      wrappedIosSrc: assets.wrappedUsdz ?? null,
                      unwrappedIosSrc: assets.unwrappedUsdz ?? null,
                    }
                  : null
              }
              initialVariant="wrapped"
              poster={assets.photo}
              targetLongestCm={assets.targetLongestCm}
              dimensions={arProduct.dimensions}
              onClose={() => setArProduct(null)}
            />
          );
        })()}
      {modelProduct &&
        (() => {
          const assets = resolveProductAssets(modelProduct.id);
          if (!assets.unwrappedGlb || !assets.wrappedGlb) return null;
          return (
            <ScannedModel3DViewer
              modelUrl={assets.unwrappedGlb}
              title={modelProduct.name}
              variantUrls={{ wrappedUrl: assets.wrappedGlb, unwrappedUrl: assets.unwrappedGlb }}
              initialVariant="unwrapped"
              targetLongestCm={assets.targetLongestCm}
              dimensions={modelProduct.dimensions}
              onClose={() => setModelProduct(null)}
            />
          );
        })()}
    </div>
  );
};
