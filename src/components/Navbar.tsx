import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, ChevronRight, HelpCircle, LogIn, LogOut, Search, ShieldCheck, ShoppingCart, User, Sun, Moon, ArrowLeft } from 'lucide-react';
import { ChocolateFactory, RoutePhase } from '../types/chocolate';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { ROLE_LABEL_ES } from '../lib/roles';
import { SearchBox } from './SearchBox';

interface NavbarProps {
  currentFactory: ChocolateFactory | null;
  phase: RoutePhase;
  visible: boolean;
  onSelectFactory: (factory: ChocolateFactory) => void;
  factories: ChocolateFactory[];
  onReturnToArchipelago: () => void;
  onOpenGuide: () => void;
  onOpenCart: () => void;
  onSearchPick?: (sku: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentFactory,
  phase,
  visible,
  onSelectFactory,
  factories,
  onReturnToArchipelago,
  onOpenGuide,
  onOpenCart,
  onSearchPick
}) => {
  const { user, role, isAdmin, isEmpresa, isLoading, errorEs, signInWithGoogle, signOut, clearError } = useAuth();
  const { count } = useCart();
  const { theme, toggleTheme } = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  // Closing the auth dropdown always clears the global auth error so a
  // reopened form starts clean (local error/loading reset via unmount).
  const closeAuth = useCallback(() => { setAuthOpen(false); clearError(); }, [clearError]);
  // A fresh login (Google success) closes the dropdown.
  useEffect(() => { if (user) setAuthOpen(false); }, [user]);
  // Close on any press outside the dropdown + toggle, and on Escape.
  // Presses inside (Google button) never trigger this:
  // the closest() guards plus stopPropagation on the panel keep them safe.
  useEffect(() => {
    if (!authOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-auth-dropdown]')) return;
      if (target?.closest?.('[data-auth-toggle]')) return;
      closeAuth();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAuth(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [authOpen, closeAuth]);
  // Mobile (<md) expandable search: collapsed = magnifier icon button,
  // open = brand animates out and the input fills the freed space.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  // Search lives only with the products (Sala + detail views), never on the main islands screen
  const showSearch = phase === 'chamber' || phase === 'unwrap' || phase === 'ar';
  // Leaving product views resets the mobile slot to collapsed (brand as before).
  useEffect(() => {
    if (!showSearch) setMobileSearchOpen(false);
  }, [showSearch]);
  // Single-X spec: pressing any other navbar button collapses the mobile
  // search slot (Escape / pick / phase change are handled in SearchBox).
  const closeMobileSearch = () => setMobileSearchOpen(false);
  // Auto-collapse the expanded mobile search on ANY tap outside the search
  // container (island canvas, product cards, HUD buttons, backdrop, other
  // navbar buttons without their own close call, etc.). Taps inside the
  // container (input, dropdown results, clear X) must NOT collapse — the
  // text X keeps clearing only. The lupa toggle is excluded here so its own
  // toggle handler stays authoritative (no pointerdown/click double-flip).
  // Desktop unaffected: this only runs while the mobile slot is open.
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-mobile-search]')) return;
      if (target?.closest?.('[data-mobile-search-toggle]')) return;
      if (mobileSearchRef.current?.contains(target as Node)) return;
      setMobileSearchOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mobileSearchOpen]);
  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.header
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 left-0 right-0 z-50 px-2 min-[400px]:px-4 sm:px-8 py-2 sm:py-3.5 pointer-events-none"
          >
            {/* Top row: [Volver][Navbar pill] in ONE flex-nowrap row on all
                widths. Mobile stays single-line via compact Volver, truncated
                brand, 36px icon buttons, and hidden eyebrow on xs. */}
            <div className="max-w-7xl mx-auto flex flex-row flex-nowrap items-center gap-1.5 sm:gap-3">
              <AnimatePresence initial={false}>
                {phase !== 'archipelago' && (
                  <motion.button
                    type="button"
                    onClick={() => { closeMobileSearch(); onReturnToArchipelago(); }}
                    aria-label="Volver atrás"
                    title="Volver atrás"
                    initial={{ x: -24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -24, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-auto flex h-10 sm:h-[52px] shrink-0 items-center gap-1 sm:gap-1.5 self-center rounded-2xl border border-[#d4af37]/40 bg-[#fffdf8]/85 px-2 sm:px-3.5 text-[11px] sm:text-xs font-bold text-[#8a6216] shadow-2xl shadow-black/70 backdrop-blur-xl transition-colors hover:bg-[#f3e7d3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37] dark:bg-[#1c100a]/85 dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Volver</span>
                  </motion.button>
                )}
              </AnimatePresence>
              <div className="flex min-h-10 sm:min-h-[52px] flex-1 min-w-0 items-center gap-1.5 sm:gap-2 pointer-events-auto backdrop-blur-xl bg-[#fffdf8]/85 dark:bg-[#1c100a]/85 border border-[#d4af37]/25 rounded-2xl px-2.5 sm:px-6 py-2 sm:py-2.5 shadow-2xl shadow-black/70">

              {/* MIDDLE slot (brand area): fixed flex-1 container between Volver
                  and Right Controls. Brand collapses (w-0/opacity-0) and the
                  mobile search input expands flex-1 INSIDE this slot only, so
                  the Right Controls row width stays constant in both states. */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
              {/* Brand / Logo — on mobile (<md) it animates out (width/opacity)
                  when the expandable search opens, freeing its space for the
                  input. Volver + right icons stay fixed; only this brand↔search
                  swap area changes. Desktop (md+) always visible. */}
              <div
                className={`flex min-w-0 items-center gap-2 sm:gap-3 overflow-hidden transition-[width,opacity,flex] duration-300 ease md:w-auto md:max-w-none md:flex-shrink-0 md:opacity-100 ${
                  mobileSearchOpen ? 'w-0 max-w-0 flex-shrink-0 opacity-0' : 'w-auto max-w-[200px] flex-shrink-0 opacity-100'
                }`}
              >
              <button
                onClick={() => { closeMobileSearch(); onReturnToArchipelago(); }}
                className="flex min-w-0 items-center group text-left cursor-pointer focus:outline-none"
                title="Volver al archipiélago de islas"
              >
                <div className="min-w-0">
                  <div className="hidden min-[400px]:flex items-center gap-1.5">
                    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#d4af37] truncate">Sucre, Bolivia</span>
                  </div>
                  <h1 className="text-[12px] min-[400px]:text-[13px] sm:text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2] tracking-tight font-serif-luxury leading-tight truncate max-w-[92px] min-[400px]:max-w-none">
                    Ruta del Chocolate
                  </h1>
                </div>
              </button>

              {/* Breadcrumb if factory is selected */}
              {currentFactory && phase !== 'archipelago' && (
                <div className="hidden md:flex items-center gap-2 pl-3 ml-2 border-l border-[#d4af37]/20">
                  <ChevronRight className="w-3.5 h-3.5 text-[#d4af37]/60" />
                  <span className="text-xs font-medium text-[#8a6216] dark:text-[#e5c158] bg-[#efe0c6] dark:bg-[#3a1d12] px-2.5 py-1 rounded-lg border border-[#d4af37]/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentFactory.islandColor }} />
                    {currentFactory.name}
                  </span>
                </div>
              )}
            </div>

            {/* Mobile (<md) expandable search input — lives in the MIDDLE slot
                only (never inside Right Controls). Expands flex-1 here while
                brand is collapsed; controls row stays shrink-0 fixed. */}
            {onSearchPick && showSearch && mobileSearchOpen && (
                <div ref={mobileSearchRef} data-mobile-search className="flex md:hidden flex-1 min-w-0">
                  <div className="w-full min-w-0 flex-1">
                    <SearchBox
                      autoFocus
                      onClose={() => setMobileSearchOpen(false)}
                      onPick={(entry) => {
                        setMobileSearchOpen(false);
                        onSearchPick(entry.sku);
                      }}
                    />
                  </div>
                </div>
            )}

            {/* M10 catalog search (live /api/search, local fallback) — product views only.
                Desktop (md+): full middle-slot width to the right of the brand,
                pushed left, unchanged always-visible input. */}
            {onSearchPick && showSearch && (
                <div className="hidden md:flex flex-1 min-w-0 justify-start">
                  <div className="w-full min-w-0 flex-1">
                    <SearchBox onPick={(entry) => onSearchPick(entry.sku)} />
                  </div>
                </div>
            )}
              </div>

            {/* Gold "Sala" shortcut removed per visual bug report: the chamber
                stays reachable via the island dive flow (archipelago ->
                diving -> chamber). */}

            {/* Right Controls: FIXED shrink-0 row (theme/cart/login + lupa
                toggle). Never flex-1, never min-w-0 — width constant in both
                search states so icons stay pixel-identical at 360px. The
                expanding input lives in the MIDDLE slot above, not here.
                Lupa toggle keeps fixed w-9 h-8 size with a constant magnifier
                icon (single-X spec: never morphs to X). */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
              {/* Factory Dropdown/Quick buttons (archipelago only; island return lives on the Volver button) */}
              {phase === 'archipelago' && (
                <div className="hidden sm:flex items-center gap-1.5">
                  {factories.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => { closeMobileSearch(); onSelectFactory(f); }}
                      className="text-xs px-2.5 py-1.5 rounded-lg text-[#5c4433] dark:text-[#d7c4b7] hover:text-[#2b1a12] hover:dark:text-[#fff] hover:bg-[#efe0c6] hover:dark:bg-[#2e1910] border border-transparent hover:border-[#d4af37]/30 transition-all cursor-pointer"
                    >
                      {f.name.replace('Chocolates ', '')}
                    </button>
                  ))}
                </div>
              )}

              {/* Mobile search lupa toggle — FIXED w-9 h-8 in both states,
                  immediately LEFT of the theme toggle. Always a magnifier
                  (single-X spec: no X morph); toggles the middle-slot input
                  without changing size, so theme/cart/login stay fixed. */}
              {onSearchPick && showSearch && (
                <button
                  type="button"
                  data-mobile-search-toggle
                  onClick={() => setMobileSearchOpen((v) => !v)}
                  aria-label={mobileSearchOpen ? 'Cerrar búsqueda' : 'Abrir búsqueda'}
                  aria-expanded={mobileSearchOpen}
                  title={mobileSearchOpen ? 'Cerrar búsqueda' : 'Buscar chocolates'}
                  className="md:hidden w-9 h-8 shrink-0 rounded-lg bg-[#faf6ef]/80 dark:bg-[#120a06]/80 border border-[#d4af37]/25 flex items-center justify-center transition-colors hover:border-[#d4af37]/60 cursor-pointer"
                >
                  <Search className="w-4 h-4 text-[#8a6216] dark:text-[#e5c158]" aria-hidden="true" />
                </button>
              )}

              {/* Theme Toggle (global light/dark, persists in localStorage) */}
              <button
                onClick={() => { closeMobileSearch(); toggleTheme(); }}
                aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                className="w-8 h-8 shrink-0 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/25 flex items-center justify-center transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-[#e5c158]" />
                ) : (
                  <Moon className="w-4 h-4 text-[#8a6216]" />
                )}
              </button>

              {/* Guide / Tour info — islands (archipelago) main view only */}
              {phase === 'archipelago' && (
              <button
                onClick={() => { closeMobileSearch(); onOpenGuide(); }}
                className="w-8 h-8 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/25 flex items-center justify-center text-[#d4af37] transition-colors cursor-pointer"
                title="Guía de navegación 3D"
              >
                <HelpCircle className="w-4 h-4 text-[#8a6216] dark:text-[#e5c158]" />
              </button>
              )}

              {/* Google-only auth: direct OAuth, no email form */}
              <button
                onClick={() => { closeMobileSearch(); onOpenCart(); }}
                aria-label={count > 0 ? `Abrir carrito, ${count} productos` : 'Abrir carrito'}
                title="Abrir carrito"
                className="relative min-w-9 sm:min-w-[44px] min-h-8 sm:min-h-[32px] px-2 sm:px-2.5 shrink-0 rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] text-[#8a6216] dark:text-[#e5c158] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/30 transition-all cursor-pointer flex items-center justify-center"
              >
                <ShoppingCart className="w-4 h-4" />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#d4af37] text-[#1a0f08] text-[10px] font-extrabold flex items-center justify-center">
                    {count}
                  </span>
                )}
              </button>
              {user ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Role badge: turista / empresa / admin surfaces the profile flag */}
                  <span
                    title={user.email ?? ROLE_LABEL_ES[role ?? 'turista']}
                    className="hidden sm:flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1.5 rounded-lg bg-[#efe0c6] dark:bg-[#3a1d12] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/30 max-w-[10rem]"
                  >
                    {isAdmin ? <ShieldCheck className="w-3 h-3 shrink-0" /> : isEmpresa ? <Building2 className="w-3 h-3 shrink-0" /> : <User className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{ROLE_LABEL_ES[role ?? 'turista']}</span>
                  </span>
                  <button
                    onClick={() => { closeMobileSearch(); signOut(); }}
                    className="flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] text-[#8a6216] dark:text-[#e5c158] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/30 transition-all cursor-pointer"
                    title={user.email ?? 'Sesión iniciada'}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline max-w-[10rem] truncate">Cerrar sesión</span>
                  </button>
                </div>
              ) : (
                <div className="relative shrink-0">
                  <button
                    onClick={() => { closeMobileSearch(); setAuthOpen((v) => !v); }}
                    data-auth-toggle
                    aria-expanded={authOpen}
                    aria-label="Iniciar sesión"
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#d4af37] text-[#1a0f08] font-bold hover:bg-[#8a6216] hover:dark:bg-[#e5c158] border border-[#d4af37] transition-all cursor-pointer disabled:opacity-60"
                    title={errorEs ?? 'Iniciar sesión con Google'}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isLoading ? 'Cargando…' : 'Iniciar sesión'}</span>
                  </button>
                  {authOpen && (
                    <div data-auth-dropdown onClick={(e) => e.stopPropagation()} className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#fffdf8]/95 dark:bg-[#1c100a]/95 border border-[#d4af37]/30 p-3 shadow-2xl shadow-black/70 backdrop-blur-xl" role="dialog" aria-label="Iniciar sesión">
                      <button
                        onClick={signInWithGoogle}
                        className="w-full min-h-[44px] rounded-xl bg-[#fcf8f2] text-[#1a0f08] text-xs font-bold hover:bg-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <LogIn className="w-4 h-4" />
                        Continuar con Google
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
          {/* Auth error slot: kept OUTSIDE the top row
              with fixed min-height. As a flex child it would squeeze the controls
              and shift the anchored dropdown left; here it only grows downward. */}
          <div className="mx-auto max-w-7xl">
            <p
              role={errorEs !== null && !user ? 'alert' : undefined}
              aria-live="polite"
              aria-hidden={errorEs === null || !!user}
              className={`pointer-events-none mt-1.5 min-h-4 text-right text-[11px] leading-4 break-words text-[#b3261e] dark:text-[#f0a6a6] ${errorEs !== null && !user ? 'visible' : 'invisible'}`}
            >
              {errorEs !== null && !user ? errorEs : ' '}
            </p>
            </div>
          </motion.header>
        )}
      </AnimatePresence>
    </>
  );
};
