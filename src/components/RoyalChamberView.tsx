import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChocolateFactory, ProductSpec } from '../types/chocolate';
import { useTheme } from '../contexts/ThemeContext';
import { ProductShowcase } from './ProductShowcase';
import type { CatalogMap } from './CartDrawer';

interface RoyalChamberViewProps {
  factory: ChocolateFactory;
  onSelectProduct: (product: ProductSpec) => void;
  /** Live price/stock per SKU, forwarded to ProductShowcase for add-to-cart. */
  catalog: CatalogMap;
  /** Optional: App opens the cart drawer after a successful add. */
  onAdded?: () => void;
}

/**
 * Sala: a lightweight 3D gold-hall ambience behind the redesigned product
 * presentation (`ProductShowcase`). There is no pedestal/base mesh: the cards
 * float over the scene background. The previous floating procedural meshes are
 * gone — products are now selected from the boutique photo + name cards.
 */
export const RoyalChamberView: React.FC<RoyalChamberViewProps> = ({
  factory,
  onSelectProduct,
  catalog,
  onAdded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);
  // True while the right-side detail drawer is open: the Sala content
  // re-centers in the free space left of the drawer (desktop only).
  const [detailOpen, setDetailOpen] = useState(false);

  const { theme } = useTheme();

  // Live theme handles: fog and hall lights follow the global theme.
  const sceneRef = useRef<THREE.Scene | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const overheadLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene / camera / renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x180b06, 0.04);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      60,
    );
    camera.position.set(0, 2.5, 7.5);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 2. Hall lighting
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.9);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const mainOverhead = new THREE.DirectionalLight(0xffdf99, 2.2);
    mainOverhead.position.set(0, 8, 4);
    scene.add(mainOverhead);
    overheadLightRef.current = mainOverhead;

    const warmRim = new THREE.DirectionalLight(0xb8860b, 1.4);
    warmRim.position.set(-5, 3, -4);
    scene.add(warmRim);
    rimLightRef.current = warmRim;

    // 3. No pedestal/base mesh: the product cards float over the scene
    // background (gradient + glow). Lights stay for future staging.
    // 4. Render loop
    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [factory]);

  // Live theme sync (no scene rebuild).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const light = theme === 'light';
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(light ? 0xf3e7d3 : 0x180b06);
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.color.set(light ? 0xfff6e8 : 0xffeedd);
      ambientLightRef.current.intensity = light ? 1.1 : 0.9;
    }
    if (overheadLightRef.current) {
      overheadLightRef.current.color.set(light ? 0xfff6e0 : 0xffdf99);
      overheadLightRef.current.intensity = light ? 1.8 : 2.2;
    }
    if (rimLightRef.current) {
      rimLightRef.current.color.set(light ? 0xc9962e : 0xb8860b);
      rimLightRef.current.intensity = light ? 1.0 : 1.4;
    }
  }, [theme]);

  return (
    <div className="relative h-screen supports-[height:100dvh]:h-[100dvh] w-full select-none overflow-hidden overscroll-none bg-gradient-to-b from-[#faf6ef] via-[#f5ead6] to-[#eeddc0] dark:from-[#1c0d07] dark:via-[#241209] dark:to-[#0e0503]">
      {/* 3D hall ambience */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Atmospheric glow */}
      <div className="pointer-events-none absolute inset-0 bg-radial-[at_50%_35%] from-[#d4af37]/25 via-transparent to-[#c9a86a]/30 dark:from-[#ffd700]/10 dark:to-[#0a0402]/85" />

      {/* Product presentation: on desktop (lg) it reserves the drawer width
          on the right so title + grid stay centered in the free space. */}
      <div
        className={`absolute inset-0 z-10 overflow-y-auto overflow-x-clip overscroll-contain transition-[padding] duration-300 ease-out ${detailOpen ? 'lg:pr-[420px]' : 'lg:pr-0'}`}
      >
        {/* Top padding clears the fixed navbar row: stacked (Volver above
            pill) on mobile needs more than the single row on sm+. */}
        <div className="mx-auto w-full max-w-5xl px-4 pt-48 sm:pt-28 pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-widest text-[#8a6216] dark:text-[#e5c158]">
            {factory.name}
          </p>
          <h1 className="mb-8 text-center font-serif-luxury text-2xl font-extrabold text-[#2b1a12] sm:text-3xl dark:text-[#fcf8f2]">
            Sala de Productos
          </h1>
          <ProductShowcase products={factory.products} onOpenLegacy={onSelectProduct} catalog={catalog} onAdded={onAdded} onDrawerChange={setDetailOpen} />
        </div>
      </div>
    </div>
  );
};
