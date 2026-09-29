import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChevronLeft } from 'lucide-react';
import { ChocolateFactory, ProductSpec } from '../types/chocolate';
import { useTheme } from '../contexts/ThemeContext';
import { ProductShowcase } from './ProductShowcase';
import type { CatalogMap } from './CartDrawer';

interface RoyalChamberViewProps {
  factory: ChocolateFactory;
  onSelectProduct: (product: ProductSpec) => void;
  onReturnToArchipelago: () => void;
  /** Live price/stock per SKU, forwarded to ProductShowcase for add-to-cart. */
  catalog: CatalogMap;
  /** Optional: App opens the cart drawer after a successful add. */
  onAdded?: () => void;
}

/**
 * Sala Real: a lightweight 3D gold-hall ambience behind the redesigned product
 * presentation (`ProductShowcase`). The previous floating procedural meshes are
 * gone — products are now selected from the simple thumbnail + name cards.
 */
export const RoyalChamberView: React.FC<RoyalChamberViewProps> = ({
  factory,
  onSelectProduct,
  onReturnToArchipelago,
  catalog,
  onAdded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const { theme } = useTheme();

  // Live theme handles: fog, floor and hall lights follow the global theme.
  const sceneRef = useRef<THREE.Scene | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const overheadLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const floorMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

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

    // 3. Grand circular chamber floor
    const floorGeo = new THREE.CylinderGeometry(8.5, 9, 0.5, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1f0e08,
      roughness: 0.2,
      metalness: 0.4,
    });
    floorMatRef.current = floorMat;
    const chamberFloor = new THREE.Mesh(floorGeo, floorMat);
    chamberFloor.position.y = -1.2;
    scene.add(chamberFloor);

    // Circular gold inlay
    const inlayGeo = new THREE.RingGeometry(3.2, 3.4, 48);
    inlayGeo.rotateX(-Math.PI / 2);
    const inlayMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide });
    const inlay = new THREE.Mesh(inlayGeo, inlayMat);
    inlay.position.y = -0.94;
    scene.add(inlay);

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
    floorMatRef.current?.color.set(light ? 0xe7d3ae : 0x1f0e08);
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
    <div className="relative h-screen w-full select-none overflow-hidden bg-gradient-to-b from-[#faf6ef] via-[#f5ead6] to-[#eeddc0] dark:from-[#1c0d07] dark:via-[#241209] dark:to-[#0e0503]">
      {/* 3D hall ambience */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Atmospheric glow */}
      <div className="pointer-events-none absolute inset-0 bg-radial-[at_50%_35%] from-[#d4af37]/25 via-transparent to-[#c9a86a]/30 dark:from-[#ffd700]/10 dark:to-[#0a0402]/85" />

      {/* Back to islands */}
      <div className="pointer-events-auto absolute top-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        <button
          onClick={onReturnToArchipelago}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#d4af37]/30 bg-[#fffdf8]/80 px-3.5 py-2 text-xs text-[#8a6216] shadow-lg backdrop-blur-md transition-all hover:bg-[#f3e7d3] hover:text-[#2b1a12] dark:bg-[#1c100a]/80 dark:text-[#e5c158] dark:hover:bg-[#2b170e] dark:hover:text-[#fff]"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Volver a las Islas</span>
        </button>
      </div>

      {/* Product presentation */}
      <div className="absolute inset-0 z-10 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pt-24 pb-16">
          <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-widest text-[#8a6216] dark:text-[#e5c158]">
            {factory.name}
          </p>
          <h1 className="mb-8 text-center font-serif-luxury text-2xl font-extrabold text-[#2b1a12] sm:text-3xl dark:text-[#fcf8f2]">
            Sala Real de Productos
          </h1>
          <ProductShowcase products={factory.products} onOpenLegacy={onSelectProduct} catalog={catalog} onAdded={onAdded} />
        </div>
      </div>
    </div>
  );
};
