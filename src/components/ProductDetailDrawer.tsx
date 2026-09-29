import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Minus, Plus, Rotate3d, ScanLine, ShoppingCart, X } from 'lucide-react';
import type { ProductSpec } from '../types/chocolate';
import { addToCartButtonState, type ShowcaseCard } from '../utils/productShowcase';
import { useCart } from '../contexts/CartContext';
import type { CatalogMap } from './CartDrawer';

interface ProductDetailDrawerProps {
  card: ShowcaseCard;
  product: ProductSpec;
  catalog: CatalogMap;
  onClose: () => void;
  onOpenAr: () => void;
  onOpen3d: () => void;
  onAdded?: () => void;
}

/**
 * Right-side detail drawer: full product info + the 3 shared actions.
 * Desktop: fixed right panel (380-420px). Mobile: full-width bottom sheet.
 * Closes via X, backdrop click, empty-grid click (parent) or Escape.
 */
export const ProductDetailDrawer: React.FC<ProductDetailDrawerProps> = ({
  card,
  product,
  catalog,
  onClose,
  onOpenAr,
  onOpen3d,
  onAdded,
}) => {
  const { add } = useCart();
  const entry = catalog[card.sku];
  const stock = entry?.stock ?? 0;
  const price = entry?.priceBOB;
  const addState = addToCartButtonState(stock);
  const [qty, setQty] = useState(1);
  const [photoFailed, setPhotoFailed] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // SKU swap replaces content in place (parent keeps a stable key):
  // reset per-product UI so the crossfade never shows stale photo/qty.
  useEffect(() => {
    setPhotoFailed(false);
    setQty(1);
  }, [card.sku]);

  // Clamp qty when stock changes.
  useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, Math.max(stock, 1))));
  }, [stock]);

  // Focus the close button on open + Escape to close.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Basic focus trap: keep Tab cycling inside the drawer.
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAdd = () => {
    const units = Math.max(1, Math.min(qty, Math.max(stock, 1)));
    for (let i = 0; i < units; i += 1) add(card.sku, stock);
    onAdded?.();
  };

  return (
    <>
      {/* Backdrop: mobile only. Desktop has no backdrop so the Sala grid
          stays visible and clickable (empty-space click still closes). */}
      <div
        className="fixed inset-0 z-30 bg-[#2b1a12]/50 backdrop-blur-[2px] sm:hidden dark:bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        ref={panelRef as React.Ref<HTMLElement>}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${card.name}`}
        data-product-detail-drawer={card.sku}
        initial={{ x: '100%', opacity: 0.4 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="fixed z-40 flex max-h-[92dvh] w-full max-w-full flex-col overflow-hidden overflow-x-hidden rounded-t-3xl border border-[#d4af37]/30 bg-[#fffdf8]/98 shadow-2xl backdrop-blur-xl inset-x-0 bottom-0 max-sm:top-auto sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-4 sm:h-auto sm:max-h-[calc(100dvh-6.5rem)] sm:w-[400px] sm:max-w-[420px] sm:rounded-3xl dark:bg-[#1c100a]/98"
      >
        {/* SKU swap content: soft crossfade in place, no slide exit/enter.
            The outer aside keeps its slide animation for open/close only. */}
        <motion.div
          key={card.sku}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex min-h-0 flex-1 flex-col"
        >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#d4af37]/20 p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold tracking-widest text-[#d4af37] uppercase">
              Detalle del producto
            </p>
            <h3 className="truncate font-serif-luxury text-lg font-bold text-[#2b1a12] dark:text-[#fcf8f2]">
              {card.name}
            </h3>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle del producto"
            className="min-h-[44px] min-w-[44px] shrink-0 cursor-pointer rounded-xl border border-[#d4af37]/30 p-2.5 text-[#8a6216] transition-colors hover:bg-[#f3e7d3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6216] dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          <div className="mb-3 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_center,#fbf3e2_0%,#f3e7d3_55%,#e9d4ae_100%)] px-6 py-4 dark:bg-[radial-gradient(ellipse_at_center,#2b170e_0%,#1c100a_60%,#120906_100%)]">
            {!photoFailed ? (
              <img
                src={card.photoUrl}
                alt={`Foto de ${card.name}`}
                loading="lazy"
                onError={() => setPhotoFailed(true)}
                className="h-full max-h-44 w-auto max-w-full object-contain drop-shadow-[0_10px_16px_rgba(43,26,18,0.25)] dark:drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
              />
            ) : (
              <div
                className="grid h-20 w-32 grid-cols-3 grid-rows-5 gap-[3px] rounded-md p-1"
                style={{ backgroundColor: card.thumbnail.cacao }}
                aria-hidden="true"
              >
                {Array.from({ length: 15 }).map((_, i) => (
                  <span key={i} className="rounded-[2px] bg-white/10" />
                ))}
              </div>
            )}
          </div>

          {card.badge && (
            <span className="mb-2 inline-block rounded-full bg-gradient-to-r from-[#d4af37] to-[#b8860b] px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-[#1a0f08] uppercase shadow-md">
              {card.badge}
            </span>
          )}
          <p className="text-sm text-[#7a5c48] italic dark:text-[#bda393]">{card.subtitle}</p>
          <p className="mt-2 text-sm leading-relaxed text-[#5c4433] dark:text-[#d7c4b7]">
            {product.description}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-[#d4af37]/20 bg-white p-3 dark:bg-[#25130b]">
              <dt className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Cacao</dt>
              <dd className="font-bold text-[#8a6216] dark:text-[#f1c40f]">
                {card.cacaoPercentage}% cacao
              </dd>
            </div>
            <div className="rounded-xl border border-[#d4af37]/20 bg-white p-3 dark:bg-[#25130b]">
              <dt className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Peso</dt>
              <dd className="font-bold text-[#2b1a12] dark:text-[#fcf8f2]">{card.weight}</dd>
            </div>
            <div className="rounded-xl border border-[#d4af37]/20 bg-white p-3 dark:bg-[#25130b]">
              <dt className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Precio</dt>
              <dd className="font-extrabold text-[#2b1a12] dark:text-[#fcf8f2]">
                {price !== undefined ? `Bs ${price.toFixed(2)}` : 'Precio en tienda'}
              </dd>
            </div>
            <div className="rounded-xl border border-[#d4af37]/20 bg-white p-3 dark:bg-[#25130b]">
              <dt className="text-[11px] text-[#7a5c48] dark:text-[#bda393]">Stock</dt>
              <dd className="font-bold text-[#2b1a12] dark:text-[#fcf8f2]">
                {stock > 0 ? `${stock} disponibles` : 'Sin stock'}
              </dd>
            </div>
          </dl>

          {/* Quantity stepper */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-bold tracking-wider text-[#7a5c48] uppercase dark:text-[#bda393]">
              Cantidad
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Reducir cantidad"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-[#d4af37]/30 text-[#8a6216] transition-colors hover:bg-[#f3e7d3] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span aria-live="polite" className="w-8 text-center text-sm font-extrabold">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Aumentar cantidad"
                disabled={qty >= Math.max(stock, 1)}
                onClick={() => setQty((q) => Math.min(Math.max(stock, 1), q + 1))}
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-[#d4af37]/30 text-[#8a6216] transition-colors hover:bg-[#f3e7d3] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer: the 3 shared actions */}
        <div className="flex flex-col items-stretch gap-2 border-t border-[#d4af37]/20 bg-[#faf6ef]/60 p-4 dark:bg-[#120906]/60">
          <button
            type="button"
            disabled={addState.disabled}
            onClick={handleAdd}
            className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] to-[#b8860b] px-4 py-3 text-xs font-extrabold tracking-wider text-[#1a0f08] uppercase shadow-lg shadow-[#d4af37]/20 transition-all hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6216] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            {addState.disabled ? 'Sin stock' : `Añadir al carrito${qty > 1 ? ` · ${qty}` : ''}`}
          </button>
          {card.hasAr && (
            <button
              type="button"
              onClick={onOpenAr}
              className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#8a6216]/30 bg-[#2b1a12] px-4 py-3 text-xs font-extrabold tracking-wider text-[#f3e7d3] uppercase shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6216] dark:bg-[#f3e7d3] dark:text-[#2b1a12]"
            >
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              Ver en realidad aumentada
            </button>
          )}
          {card.has3d && (
            <button
              type="button"
              onClick={onOpen3d}
              className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d4af37]/40 bg-[#efe0c6] px-4 py-3 text-xs font-extrabold tracking-wider text-[#8a6216] uppercase transition-all hover:bg-[#e2cda4] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6216] dark:bg-[#2e1910] dark:text-[#e5c158] dark:hover:bg-[#3d2215]"
            >
              <Rotate3d className="h-4 w-4" aria-hidden="true" />
              Ver en 3D
            </button>
          )}
        </div>
        </motion.div>
      </motion.aside>
    </>
  );
};
