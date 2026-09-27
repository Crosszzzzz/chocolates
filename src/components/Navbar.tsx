import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, Compass, Volume2, VolumeX, Landmark, Sparkles, ChevronRight, HelpCircle, RotateCcw, LogIn, LogOut, ShieldCheck, ShoppingCart, User } from 'lucide-react';
import { ChocolateFactory, RoutePhase } from '../types/chocolate';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
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
  onGoToChamber?: () => void;
  onGoToCorridor?: () => void;
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
  onGoToChamber,
  onGoToCorridor,
  onOpenGuide,
  onOpenCart,
  onSearchPick
}) => {
  const { user, role, isAdmin, isEmpresa, isLoading, errorEs, signInWithGoogle, signOut } = useAuth();
  const { count } = useCart();
  const [authOpen, setAuthOpen] = useState(false);
  return (
    <AnimatePresence>
      {visible && (
        <motion.header
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-8 py-3.5 pointer-events-none"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 pointer-events-auto backdrop-blur-xl bg-[#1c100a]/85 border border-[#d4af37]/25 rounded-2xl px-4 sm:px-6 py-2.5 shadow-2xl shadow-black/70">
            
            {/* Brand / Logo */}
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={onReturnToArchipelago}
                className="flex items-center gap-2.5 group text-left cursor-pointer focus:outline-none"
                title="Volver al archipiélago de islas"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d4af37] via-[#b8860b] to-[#78350f] p-0.5 shadow-lg shadow-[#b8860b]/30 group-hover:scale-105 transition-transform duration-300">
                  <div className="w-full h-full bg-[#1e1009] rounded-[10px] flex items-center justify-center">
                    <Compass className="w-4 h-4 text-[#e5c158] group-hover:rotate-45 transition-transform duration-500" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#d4af37]">Sucre, Bolivia</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-[#d4af37]/15 text-[#e5c158] rounded border border-[#d4af37]/30">3D</span>
                  </div>
                  <h1 className="text-sm sm:text-base font-bold text-[#fcf8f2] tracking-tight font-serif-luxury leading-tight truncate">
                    Ruta del Chocolate
                  </h1>
                </div>
              </button>

              {/* Breadcrumb if factory is selected */}
              {currentFactory && phase !== 'archipelago' && (
                <div className="hidden md:flex items-center gap-2 pl-3 ml-2 border-l border-[#d4af37]/20">
                  <ChevronRight className="w-3.5 h-3.5 text-[#d4af37]/60" />
                  <span className="text-xs font-medium text-[#e5c158] bg-[#3a1d12] px-2.5 py-1 rounded-lg border border-[#d4af37]/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentFactory.islandColor }} />
                    {currentFactory.name}
                  </span>
                </div>
              )}
            </div>

            {/* M10 catalog search (live /api/search, local fallback) */}
            {onSearchPick && (
              <div className="hidden md:block flex-1 max-w-xs">
                <SearchBox onPick={(entry) => onSearchPick(entry.sku)} />
              </div>
            )}

            {/* Middle Nav: Quick Navigation between stages when inside a factory */}
            {currentFactory && phase !== 'archipelago' && phase !== 'diving' && (
              <div className="hidden lg:flex items-center gap-1 bg-[#120a06]/80 p-1 rounded-xl border border-[#d4af37]/15 text-xs">
                <button
                  onClick={onGoToCorridor}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    phase === 'corridor'
                      ? 'bg-[#d4af37] text-[#1a0f08] font-bold shadow-md shadow-[#d4af37]/30'
                      : 'text-[#d7c4b7] hover:text-[#fff] hover:bg-[#2b1810]'
                  }`}
                >
                  Pasillo Histórico
                </button>
                <button
                  onClick={onGoToChamber}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    phase === 'chamber' || phase === 'unwrap' || phase === 'ar'
                      ? 'bg-[#d4af37] text-[#1a0f08] font-bold shadow-md shadow-[#d4af37]/30'
                      : 'text-[#d7c4b7] hover:text-[#fff] hover:bg-[#2b1810]'
                  }`}
                >
                  Sala Real de Productos
                </button>
              </div>
            )}

            {/* Right Controls: Factory Selector / Audio / Guide / Reset */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {/* Factory Dropdown/Quick buttons */}
              {phase === 'archipelago' ? (
                <div className="hidden sm:flex items-center gap-1.5">
                  {factories.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelectFactory(f)}
                      className="text-xs px-2.5 py-1.5 rounded-lg text-[#d7c4b7] hover:text-[#fff] hover:bg-[#2e1910] border border-transparent hover:border-[#d4af37]/30 transition-all cursor-pointer"
                    >
                      {f.name.replace('Chocolates ', '')}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={onReturnToArchipelago}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#2e1910] text-[#e5c158] hover:bg-[#3d2215] border border-[#d4af37]/30 transition-all cursor-pointer"
                  title="Volver a ver las 3 islas flotantes"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ver Islas</span>
                </button>
              )}

              {/* Sound Toggle */}
              <button
                onClick={onToggleSound}
                className="w-8 h-8 rounded-xl bg-[#2b170e] hover:bg-[#3d2215] border border-[#d4af37]/25 flex items-center justify-center text-[#d4af37] transition-colors cursor-pointer"
                title={soundEnabled ? 'Desactivar efectos de sonido' : 'Activar efectos sensoriales'}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#e5c158]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-[#8a7265]" />
                )}
              </button>

              {/* Guide / Tour info */}
              <button
                onClick={onOpenGuide}
                className="w-8 h-8 rounded-xl bg-[#2b170e] hover:bg-[#3d2215] border border-[#d4af37]/25 flex items-center justify-center text-[#d4af37] transition-colors cursor-pointer"
                title="Guía de navegación 3D"
              >
                <HelpCircle className="w-4 h-4 text-[#e5c158]" />
              </button>

              {/* Social + email auth (M9): Google session + correo, Spanish strings, no 3D impact */}
              <button
                onClick={onOpenCart}
                aria-label={count > 0 ? `Abrir carrito, ${count} productos` : 'Abrir carrito'}
                title="Abrir carrito"
                className="relative min-w-[44px] min-h-[32px] px-2.5 rounded-lg bg-[#2e1910] text-[#e5c158] hover:bg-[#3d2215] border border-[#d4af37]/30 transition-all cursor-pointer flex items-center justify-center"
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
                    className="hidden sm:flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1.5 rounded-lg bg-[#3a1d12] text-[#e5c158] border border-[#d4af37]/30 max-w-[10rem]"
                  >
                    {isAdmin ? <ShieldCheck className="w-3 h-3 shrink-0" /> : isEmpresa ? <Building2 className="w-3 h-3 shrink-0" /> : <User className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{ROLE_LABEL_ES[role ?? 'turista']}</span>
                  </span>
                  <button
                    onClick={signOut}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#2e1910] text-[#e5c158] hover:bg-[#3d2215] border border-[#d4af37]/30 transition-all cursor-pointer"
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
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#d4af37] text-[#1a0f08] font-bold hover:bg-[#e5c158] border border-[#d4af37] transition-all cursor-pointer disabled:opacity-60"
                    title={errorEs ?? 'Iniciar sesión con Google o correo'}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isLoading ? 'Cargando…' : 'Iniciar sesión'}</span>
                  </button>
                  {authOpen && (
                    <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#1c100a]/95 border border-[#d4af37]/30 p-3 shadow-2xl shadow-black/70 backdrop-blur-xl" role="dialog" aria-label="Iniciar sesión">
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

            {errorEs && !user && (
              <p role="alert" className="mt-1.5 text-[11px] text-[#f0a6a6]">
                {errorEs}
              </p>
            )}

          </div>
        </motion.header>
      )}
    </AnimatePresence>
  );
};
