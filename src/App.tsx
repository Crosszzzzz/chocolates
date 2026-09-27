import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FACTORIES, fetchCatalog, toCommerce, type CatalogEntry } from './data/factories';
import { ChocolateFactory, ProductSpec, RoutePhase } from './types/chocolate';
import { Navbar } from './components/Navbar';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { CartDrawer, type CatalogMap } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { AdminPanel } from './components/AdminPanel';
import { FloatingIslandsView } from './components/FloatingIslandsView';
import { AmbientVideo } from './components/AmbientVideo';
import { HeritageCorridorView } from './components/HeritageCorridorView';
import { RoyalChamberView } from './components/RoyalChamberView';
import { UnwrappingModalView } from './components/UnwrappingModalView';
import { ArExperienceView } from './components/ArExperienceView';
import { TourGuideModal } from './components/TourGuideModal';
import { toggleAudio, isAudioEnabled, getAudioContext, playIslandDiveChime } from './utils/audio';
import { initMonitoring } from './lib/monitoring';

// Timed M2 dive: archipelago -> diving -> corridor (matches island camera travel).
const DIVE_MS = 1200;

// M15 observability: attach global error handlers once (no-op without VITE_SENTRY_DSN).
initMonitoring();

// M11: binds the server cart to the logged-in user (guest flow untouched).
function CartServerBridge(): null {
  const { user } = useAuth();
  const { loadFromServer, unlinkServer } = useCart();
  const prevId = useRef<string | null>(null);
  useEffect(() => {
    const id = user?.id ?? null;
    if (id !== null && id !== prevId.current) {
      prevId.current = id;
      void loadFromServer(id);
    } else if (id === null && prevId.current !== null) {
      prevId.current = null;
      unlinkServer();
    }
  }, [user, loadFromServer, unlinkServer]);
  return null;
}

export default function App() {  const [currentFactory, setCurrentFactory] = useState<ChocolateFactory | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSpec | null>(null);
  const [phase, setPhase] = useState<RoutePhase>('archipelago');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [navbarVisible, setNavbarVisible] = useState<boolean>(true);
  // PR3 catalog + cart overlay state (visual-no-op 3D, overlay only).
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  // Pending M2 dive timer + the factory it carries to the corridor.
  const diveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const divingFactoryId = useRef<string | null>(null);
  function clearDiveTimer(): void {
    if (diveTimer.current !== null) { clearTimeout(diveTimer.current); diveTimer.current = null }
  }
  // A pending dive must never fire after unmount.
  useEffect(() => () => {
    if (diveTimer.current !== null) clearTimeout(diveTimer.current);
  }, []);
  useEffect(() => {
    let alive = true;
    void fetchCatalog().then(({ entries }) => { if (alive) setCatalog(entries) }); return () => { alive = false };
  }, []);
  const catalogMap = useMemo<CatalogMap>(() => Object.fromEntries(catalog.map((e) => [e.sku, { nameEs: e.nameEs, priceBOB: e.priceBOB, stock: e.stock }])) as CatalogMap, [catalog]);

  // Initialize audio context on first user click
  useEffect(() => {
    const handleFirstInteraction = () => {
      getAudioContext();
      window.removeEventListener('pointerdown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction);
    return () => window.removeEventListener('pointerdown', handleFirstInteraction);
  }, []);

  // Update navbar visibility according to user specifications:
  // "desaparecera en las interacciones y aparecera cuando se llegue a los productos o cuando aparezca las fabricas flotando como islas"
  useEffect(() => {
    if (phase === 'archipelago' || phase === 'chamber') {
      setNavbarVisible(true);
    } else if (phase === 'diving') {
      setNavbarVisible(false);
    } else if (phase === 'corridor') {
      // In corridor, visible at start and end
      setNavbarVisible(true);
    } else if (phase === 'unwrap') {
      setNavbarVisible(true);
    } else if (phase === 'ar') {
      setNavbarVisible(true);
    }
  }, [phase]);

  // Handle user mouse movement near the top edge to smoothly reveal navbar if hidden
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 60) {
        setNavbarVisible(true);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleToggleSound = () => {
    const newState = toggleAudio();
    setSoundEnabled(newState);
  };

  const handleSelectFactory = (factory: ChocolateFactory) => {
    // The islands view re-fires onSelectFactory after its camera travel for
    // the same factory: let the pending dive finish instead of restarting it.
    if (divingFactoryId.current === factory.id) return;
    clearDiveTimer();
    setCurrentFactory(factory);
    let reduced = false;
    try {
      reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch { reduced = false }
    if (reduced) {
      divingFactoryId.current = null;
      setPhase('corridor');
      return;
    }
    // Chime runs in the click gesture (autoplay-safe); the timer then walks
    // archipelago -> diving -> corridor. Skippable, corridor always reachable.
    divingFactoryId.current = factory.id;
    playIslandDiveChime();
    setPhase('diving');
    diveTimer.current = setTimeout(() => {
      diveTimer.current = null;
      divingFactoryId.current = null;
      setPhase('corridor');
    }, DIVE_MS);
  };

  const handleSkipDive = () => {
    clearDiveTimer();
    divingFactoryId.current = null;
    setPhase('corridor');
  };

  const handleEnterChamber = () => {
    setPhase('chamber');
  };

  const handleSelectProduct = (product: ProductSpec) => {
    setSelectedProduct(product);
    setPhase('unwrap');
  };

  const handleBackToChamber = () => {
    setSelectedProduct(null);
    setPhase('chamber');
  };

  const handleOpenAr = () => {
    if (selectedProduct) {
      setPhase('ar');
    }
  };

  const handleBackToChamberFromAr = () => {
    setSelectedProduct(null);
    setPhase('chamber');
  };

  const handleReturnToArchipelago = () => {
    clearDiveTimer();
    divingFactoryId.current = null;
    setPhase('archipelago');
    setSelectedProduct(null);
    setCurrentFactory(null);
  };

  const handleGoToCorridor = () => {
    if (currentFactory) {
      setSelectedProduct(null);
      setPhase('corridor');
    }
  };

  // M10 search: jump to the picked product's factory chamber (sku == product id).
  const handleSearchPick = (sku: string) => {
    const factory = FACTORIES.find((f) => f.products.some((p) => p.id === sku));
    if (!factory) return;
    setSelectedProduct(null);
    setCurrentFactory(factory);
    setPhase('chamber');
  };

  return (
    <AuthProvider>
    <CartProvider>
    <CartServerBridge />
    <div className="relative w-screen h-dvh overflow-hidden bg-[#120a06] text-[#f7efe5] font-sans select-none">
      {/* M6 ambient background videos (renders nothing when no /videos/*.mp4 exist) */}
      <AmbientVideo />
      {/* Dynamic Global Floating Navbar */}
      <Navbar
        currentFactory={currentFactory}
        phase={phase}
        visible={navbarVisible}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onSelectFactory={handleSelectFactory}
        factories={FACTORIES}
        onReturnToArchipelago={handleReturnToArchipelago}
        onGoToChamber={handleEnterChamber}
        onGoToCorridor={handleGoToCorridor}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenCart={() => setCartOpen(true)}
        onSearchPick={handleSearchPick}
      />

      {/* Primary Experience Stages */}
      <main className="w-full h-full">
        {(phase === 'archipelago' || phase === 'diving') && (
          <FloatingIslandsView
            factories={FACTORIES}
            onSelectFactory={handleSelectFactory}
            isDiving={phase === 'diving'}
          />
        )}

        {/* M2 dive overlay: timed transition with skip; navbar hides via phase */}
        {phase === 'diving' && currentFactory && (
          <div role="status" aria-live="polite" aria-label={`Transición hacia ${currentFactory.name}`}
            className="absolute inset-0 z-50 bg-[#120a06] flex flex-col items-center justify-center px-4">
            <h3 className="text-2xl sm:text-4xl font-bold text-[#fcf8f2] text-center">
              Adentrándose en {currentFactory.name}
            </h3>
            <p className="text-sm text-[#e5c158] mt-2 italic text-center">
              Abriendo las puertas del pasillo patrimonial…
            </p>
            <button onClick={handleSkipDive} aria-label="Omitir transición"
              className="mt-6 min-h-[44px] min-w-[44px] px-6 rounded-xl bg-[#2b170e] text-[#e5c158] border border-[#d4af37]/40 text-sm font-bold cursor-pointer">
              Omitir
            </button>
          </div>
        )}

        {phase === 'corridor' && currentFactory && (
          <HeritageCorridorView
            factory={currentFactory}
            onEnterChamber={handleEnterChamber}
            onReturnToArchipelago={handleReturnToArchipelago}
          />
        )}

        {phase === 'chamber' && currentFactory && (
          <RoyalChamberView
            factory={currentFactory}
            onSelectProduct={handleSelectProduct}
            onReturnToCorridor={handleGoToCorridor}
            onReturnToArchipelago={handleReturnToArchipelago}
          />
        )}

        {phase === 'unwrap' && currentFactory && selectedProduct && (
          <UnwrappingModalView
            product={selectedProduct}
            factory={currentFactory}
            onBackToChamber={handleBackToChamber}
            onOpenAr={handleOpenAr}
          />
        )}

        {phase === 'ar' && currentFactory && selectedProduct && (
          <ArExperienceView
            sku={toCommerce(selectedProduct).sku}
            onBackToChamber={handleBackToChamberFromAr}
          />
        )}
      </main>

      {/* Tourist Guide & Context Modal */}
      <TourGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* PR3 cart overlay (bottom-sheet mobile, panel desktop) */}
      <CartDrawer open={cartOpen} catalog={catalogMap} onClose={() => setCartOpen(false)} onCheckout={() => { setCartOpen(false); setCheckoutOpen(true) }} />
      {/* PR4 checkout overlay (mock pay + wa.me, visual-no-op 3D) */}
      <CheckoutModal open={checkoutOpen} catalog={catalogMap} onClose={() => setCheckoutOpen(false)} />
      {/* PR5 admin overlay (allow-list gated, visual-no-op 3D) */}
      <AdminPanel catalog={catalogMap} />

    </div>
    </CartProvider>
    </AuthProvider>
  );
}
