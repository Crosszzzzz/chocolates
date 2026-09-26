import React, { useState, useEffect, useMemo } from 'react';
import { FACTORIES, fetchCatalog, type CatalogEntry } from './data/factories';
import { ChocolateFactory, ProductSpec, RoutePhase } from './types/chocolate';
import { Navbar } from './components/Navbar';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { CartDrawer, type CatalogMap } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { AdminPanel } from './components/AdminPanel';
import { FloatingIslandsView } from './components/FloatingIslandsView';
import { HeritageCorridorView } from './components/HeritageCorridorView';
import { RoyalChamberView } from './components/RoyalChamberView';
import { UnwrappingModalView } from './components/UnwrappingModalView';
import { TourGuideModal } from './components/TourGuideModal';
import { toggleAudio, isAudioEnabled, getAudioContext } from './utils/audio';

export default function App() {
  const [currentFactory, setCurrentFactory] = useState<ChocolateFactory | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSpec | null>(null);
  const [phase, setPhase] = useState<RoutePhase>('archipelago');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [navbarVisible, setNavbarVisible] = useState<boolean>(true);
  // PR3 catalog + cart overlay state (visual-no-op 3D, overlay only).
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
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
    setCurrentFactory(factory);
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

  const handleReturnToArchipelago = () => {
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

  return (
    <AuthProvider>
    <CartProvider>
    <div className="relative w-screen h-dvh overflow-hidden bg-[#120a06] text-[#f7efe5] font-sans select-none">
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
      />

      {/* Primary Experience Stages */}
      <main className="w-full h-full">
        {phase === 'archipelago' && (
          <FloatingIslandsView
            factories={FACTORIES}
            onSelectFactory={handleSelectFactory}
            isDiving={phase === 'diving'}
          />
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
