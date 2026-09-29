import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, Volume2, VolumeX, ChevronRight, HelpCircle, LogIn, LogOut, ShieldCheck, ShoppingCart, User, Sun, Moon, ArrowLeft } from 'lucide-react';
import { ChocolateFactory, RoutePhase } from '../types/chocolate';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { ROLE_LABEL_ES } from '../lib/roles';
import { EmailAuthForm } from './EmailAuthForm';
import { SearchBox } from './SearchBox';

interface NavbarProps {
  currentFactory: ChocolateFactory | null;
  phase: RoutePhase;
  visible: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
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
  soundEnabled,
  onToggleSound,
  onSelectFactory,
  factories,
  onReturnToArchipelago,
  onOpenGuide,
  onOpenCart,
  onSearchPick
}) => {
  const { user, role, isAdmin, isEmpresa, isLoading, errorEs, signInWithGoogle, signOut } = useAuth();
  const { count } = useCart();
  const { theme, toggleTheme } = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  // Search lives only with the products (Sala + detail views), never on the main islands screen
  const showSearch = phase === 'chamber' || phase === 'unwrap' || phase === 'ar';
  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.header
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-8 py-3.5 pointer-events-none"
          >
            {/* Top row: [Volver][Navbar pill] sharing one vertical level and
                one height (h-[52px]). Mobile stacks (Volver above, pill full
                width); sm+ sits side by side with a gap. Hidden in
                archipelago via the phase guard below. */}
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <AnimatePresence initial={false}>
                {phase !== 'archipelago' && (
                  <motion.button
                    type="button"
                    onClick={onReturnToArchipelago}
                    aria-label="Volver atrás"
                    title="Volver atrás"
                    initial={{ x: -24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -24, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-auto flex h-[52px] shrink-0 items-center gap-1.5 self-start rounded-2xl border border-[#d4af37]/40 bg-[#fffdf8]/85 px-3.5 text-xs font-bold text-[#8a6216] shadow-2xl shadow-black/70 backdrop-blur-xl transition-colors hover:bg-[#f3e7d3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37] sm:self-center dark:bg-[#1c100a]/85 dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Volver</span>
                  </motion.button>
                )}
              </AnimatePresence>
              <div className="flex min-h-[52px] w-full sm:w-auto sm:flex-1 min-w-0 items-center justify-between gap-2 pointer-events-auto backdrop-blur-xl bg-[#fffdf8]/85 dark:bg-[#1c100a]/85 border border-[#d4af37]/25 rounded-2xl px-4 sm:px-6 py-2.5 shadow-2xl shadow-black/70">

              {/* Brand / Logo */}
              <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={onReturnToArchipelago}
                className="flex items-center group text-left cursor-pointer focus:outline-none"
                title="Volver al archipiélago de islas"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#d4af37]">Sucre, Bolivia</span>
                  </div>
                  <h1 className="text-sm sm:text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2] tracking-tight font-serif-luxury leading-tight truncate">
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

            {/* M10 catalog search (live /api/search, local fallback) — product views only */}
            {onSearchPick && showSearch && (
              <div className="hidden md:block flex-1 max-w-xs">
                <SearchBox onPick={(entry) => onSearchPick(entry.sku)} />
              </div>
            )}

            {/* Gold "Sala" shortcut removed per visual bug report: the chamber
                stays reachable via the island dive flow (archipelago ->
                diving -> chamber). */}

            {/* Right Controls: Factory Selector / Audio / Guide / Reset */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {/* Factory Dropdown/Quick buttons (archipelago only; island return lives on the Volver button) */}
              {phase === 'archipelago' && (
                <div className="hidden sm:flex items-center gap-1.5">
                  {factories.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelectFactory(f)}
                      className="text-xs px-2.5 py-1.5 rounded-lg text-[#5c4433] dark:text-[#d7c4b7] hover:text-[#2b1a12] hover:dark:text-[#fff] hover:bg-[#efe0c6] hover:dark:bg-[#2e1910] border border-transparent hover:border-[#d4af37]/30 transition-all cursor-pointer"
                    >
                      {f.name.replace('Chocolates ', '')}
                    </button>
                  ))}
                </div>
              )}

              {/* Theme Toggle (global light/dark, persists in localStorage) */}
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                className="w-8 h-8 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/25 flex items-center justify-center transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-[#e5c158]" />
                ) : (
                  <Moon className="w-4 h-4 text-[#8a6216]" />
                )}
              </button>

              {/* Sound Toggle */}
              <button
                onClick={onToggleSound}
                className="w-8 h-8 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/25 flex items-center justify-center text-[#d4af37] transition-colors cursor-pointer"
                title={soundEnabled ? 'Desactivar efectos de sonido' : 'Activar efectos sensoriales'}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#8a6216] dark:text-[#e5c158]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-[#8a7265]" />
                )}
              </button>

              {/* Guide / Tour info */}
              <button
                onClick={onOpenGuide}
                className="w-8 h-8 rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/25 flex items-center justify-center text-[#d4af37] transition-colors cursor-pointer"
                title="Guía de navegación 3D"
              >
                <HelpCircle className="w-4 h-4 text-[#8a6216] dark:text-[#e5c158]" />
              </button>

              {/* Social + email auth (M9): Google session + correo, Spanish strings, no 3D impact */}
              <button
                onClick={onOpenCart}
                aria-label={count > 0 ? `Abrir carrito, ${count} productos` : 'Abrir carrito'}
                title="Abrir carrito"
                className="relative min-w-[44px] min-h-[32px] px-2.5 rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] text-[#8a6216] dark:text-[#e5c158] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/30 transition-all cursor-pointer flex items-center justify-center"
              >
                <ShoppingCart className="w-4 h-4" />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#d4af37] text-[#1a0f08] text-[10px] font-extrabold flex items-center justify-center">
                    {count}
                  </span>
                )}
              </button>
              {user ? (
                <div className="flex items-center gap-1.5">
                  {/* Role badge: turista / empresa / admin surfaces the profile flag */}
                  <span
                    title={user.email ?? ROLE_LABEL_ES[role ?? 'turista']}
                    className="hidden sm:flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1.5 rounded-lg bg-[#efe0c6] dark:bg-[#3a1d12] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/30 max-w-[10rem]"
                  >
                    {isAdmin ? <ShieldCheck className="w-3 h-3 shrink-0" /> : isEmpresa ? <Building2 className="w-3 h-3 shrink-0" /> : <User className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{ROLE_LABEL_ES[role ?? 'turista']}</span>
                  </span>
                  <button
                    onClick={signOut}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] text-[#8a6216] dark:text-[#e5c158] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] border border-[#d4af37]/30 transition-all cursor-pointer"
                    title={user.email ?? 'Sesión iniciada'}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline max-w-[10rem] truncate">Cerrar sesión</span>
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => setAuthOpen((v) => !v)}
                    aria-expanded={authOpen}
                    aria-label="Iniciar sesión"
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#d4af37] text-[#1a0f08] font-bold hover:bg-[#8a6216] hover:dark:bg-[#e5c158] border border-[#d4af37] transition-all cursor-pointer disabled:opacity-60"
                    title={errorEs ?? 'Iniciar sesión con Google o correo'}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isLoading ? 'Cargando…' : 'Iniciar sesión'}</span>
                  </button>
                  {authOpen && (
                    <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#fffdf8]/95 dark:bg-[#1c100a]/95 border border-[#d4af37]/30 p-3 shadow-2xl shadow-black/70 backdrop-blur-xl" role="dialog" aria-label="Iniciar sesión">
                      <button
                        onClick={signInWithGoogle}
                        className="w-full min-h-[44px] rounded-xl bg-[#fcf8f2] text-[#1a0f08] text-xs font-bold hover:bg-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <LogIn className="w-4 h-4" />
                        Continuar con Google
                      </button>
                      <div className="flex items-center gap-2 my-2.5" aria-hidden="true">
                        <span className="h-px flex-1 bg-[#d4af37]/20" />
                        <span className="text-[10px] uppercase tracking-wide text-[#8a7265]">o con correo</span>
                        <span className="h-px flex-1 bg-[#d4af37]/20" />
                      </div>
                      <EmailAuthForm onDone={() => setAuthOpen(false)} />
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
