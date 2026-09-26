import React, { useState, useEffect } from 'react';
import { FACTORIES } from './data/factories';
import { ChocolateFactory, ProductSpec, RoutePhase } from './types/chocolate';
import { Navbar } from './components/Navbar';
import { FloatingIslandsView } from './components/FloatingIslandsView';
import { HeritageCorridorView } from './components/HeritageCorridorView';
import { RoyalChamberView } from './components/RoyalChamberView';
import { UnwrappingModalView } from './components/UnwrappingModalView';
import { ArExperienceView } from './components/ArExperienceView';
import { TourGuideModal } from './components/TourGuideModal';
import { toggleAudio, isAudioEnabled, getAudioContext } from './utils/audio';

/** Phase the user was in before opening AR — used to route "back". */
type ArReturnPhase = 'chamber' | 'unwrap';

export default function App() {
  const [currentFactory, setCurrentFactory] = useState<ChocolateFactory | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSpec | null>(null);
  const [phase, setPhase] = useState<RoutePhase>('archipelago');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [navbarVisible, setNavbarVisible] = useState<boolean>(true);
  const [arReturnPhase, setArReturnPhase] = useState<ArReturnPhase>('chamber');
  // Unwrap progress is lifted so AR can resume from it (and vice versa).
  const [unwrapProgress, setUnwrapProgress] = useState<number>(0);

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
      // Immersive AR provides its own HUD (dom-overlay).
      setNavbarVisible(false);
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
    setUnwrapProgress(0);
    setPhase('unwrap');
  };

  const handleBackToChamber = () => {
    setSelectedProduct(null);
    setUnwrapProgress(0);
    setPhase('chamber');
  };

  const handleReturnToArchipelago = () => {
    setPhase('archipelago');
    setSelectedProduct(null);
    setCurrentFactory(null);
    setUnwrapProgress(0);
  };

  const handleGoToCorridor = () => {
    if (currentFactory) {
      setSelectedProduct(null);
      setPhase('corridor');
    }
  };

  const handleOpenAr = (product: ProductSpec, from: ArReturnPhase) => {
    setSelectedProduct(product);
    setArReturnPhase(from);
    setPhase('ar');
  };

  const handleBackFromAr = () => {
    setPhase(arReturnPhase);
  };

  return (
    <div className="relative w-screen h-app overflow-hidden bg-[#120a06] text-[#f7efe5] font-sans select-none">

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
            onOpenAr={(product) => handleOpenAr(product, 'chamber')}
          />
        )}

        {phase === 'unwrap' && currentFactory && selectedProduct && (
          <UnwrappingModalView
            product={selectedProduct}
            factory={currentFactory}
            onBackToChamber={handleBackToChamber}
            onOpenAr={(product) => handleOpenAr(product, 'unwrap')}
            initialProgress={unwrapProgress}
            onProgressChange={setUnwrapProgress}
          />
        )}

        {phase === 'ar' && currentFactory && selectedProduct && (
          <ArExperienceView
            product={selectedProduct}
            factory={currentFactory}
            initialProgress={unwrapProgress}
            onProgressChange={setUnwrapProgress}
            onBack={handleBackFromAr}
          />
        )}
      </main>

      {/* Tourist Guide & Context Modal */}
      <TourGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

    </div>
  );
}
