import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FACTORIES, fetchCatalog, type CatalogEntry } from './data/factories';
import { ChocolateFactory, ProductSpec, RoutePhase } from './types/chocolate';
import { Navbar } from './components/Navbar';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { CartDrawer, type CatalogMap } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { AdminPanel } from './components/AdminPanel';
import { FloatingIslandsView } from './components/FloatingIslandsView';
import { AmbientVideo } from './components/AmbientVideo';
import { RoyalChamberView } from './components/RoyalChamberView';
import { UnwrappingModalView } from './components/UnwrappingModalView';
import { ArExperienceView } from './components/ArExperienceView';
import { TourGuideModal } from './components/TourGuideModal';
import { initMonitoring } from './lib/monitoring';

// Timed dive: archipelago -> diving -> chamber (matches island camera travel).
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
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [navbarVisible, setNavbarVisible] = useState<boolean>(true);
  // PR3 catalog + cart overlay state (visual-no-op 3D, overlay only).
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  // Pending dive timer + the factory it carries to the chamber.
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

  // Update navbar visibility according to user specifications:
  // "desaparecera en las interacciones y aparecera cuando se llegue a los productos o cuando aparezca las fabricas flotando como islas"
  useEffect(() => {
    if (phase === 'archipelago' || phase === 'chamber') {
      setNavbarVisible(true);
    } else if (phase === 'diving') {
      setNavbarVisible(false);
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
      setPhase('chamber');
      return;
    }
    // The timer walks archipelago -> diving -> chamber. Skippable, chamber always reachable.
    divingFactoryId.current = factory.id;
    setPhase('diving');
    diveTimer.current = setTimeout(() => {
      diveTimer.current = null;
      divingFactoryId.current = null;
      setPhase('chamber');
    }, DIVE_MS);
  };

  const handleSkipDive = () => {
    clearDiveTimer();
    divingFactoryId.current = null;
    setPhase('chamber');
  };

  // Safety net: the timed dive must always reach the chamber, even if the
  // primary timer is lost (throttled tab, HMR swap). Escape still skips it.
  // The cinematic title lives in FloatingIslandsView (pointer-events-none).
  useEffect(() => {
    if (phase !== 'diving') return;
    const watchdog = setTimeout(() => {
      divingFactoryId.current = null;
      setPhase((p) => (p === 'diving' ? 'chamber' : p));
    }, DIVE_MS + 2500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkipDive();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(watchdog);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  // Navbar factory shortcuts (Para Ti / Sucre / Taboada) jump straight to
  // that factory's product room (Sala).
  const handleShortcutFactory = (factory: ChocolateFactory) => {
    clearDiveTimer();
    divingFactoryId.current = null;
    setSelectedProduct(null);
    setCurrentFactory(factory);
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
    <div className="relative w-screen h-dvh overflow-hidden bg-[#faf6ef] dark:bg-[#120a06] text-[#2b1a12] dark:text-[#f7efe5] font-sans select-none">
      {/* M6 ambient background videos (renders nothing when no /videos/*.mp4 exist) */}
      <AmbientVideo />
      {/* Dynamic Global Floating Navbar */}
      <Navbar
        currentFactory={currentFactory}
        phase={phase}
        visible={navbarVisible}
        onSelectFactory={handleShortcutFactory}
        factories={FACTORIES}
        onReturnToArchipelago={handleReturnToArchipelago}
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

        {/* Dive: no App-level interstitial here. The cinematic dive title
            lives in FloatingIslandsView (activeFactory overlay); this phase
            only keeps the islands mounted during camera travel, then chamber. */}

        {phase === 'chamber' && currentFactory && (
          <RoyalChamberView
            factory={currentFactory}
            onSelectProduct={handleSelectProduct}
            catalog={catalogMap}
            onAdded={() => setCartOpen(true)}
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
            product={selectedProduct}
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
