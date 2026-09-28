import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Sparkles, ArrowRight, Eye, ChevronLeft, Award } from 'lucide-react';
import { ChocolateFactory, ProductSpec } from '../types/chocolate';
import { playPedestalHum } from '../utils/audio';
import { loadProductModel } from '../utils/glbProduct';
import { useCart } from '../contexts/CartContext';
import { toCommerce } from '../data/factories';

interface RoyalChamberViewProps {
  factory: ChocolateFactory;
  onSelectProduct: (product: ProductSpec) => void;
  onReturnToCorridor: () => void;
  onReturnToArchipelago: () => void;
}

export const RoyalChamberView: React.FC<RoyalChamberViewProps> = ({
  factory,
  onSelectProduct,
  onReturnToCorridor,
  onReturnToArchipelago
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredProduct, setHoveredProduct] = useState<ProductSpec | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSpec | null>(null);
  // PR3 cart overlay hook (overlay-only, never inside the scene effect).
  const { add, warning } = useCart();

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const productMeshesRef = useRef<{ [key: string]: THREE.Group }>({});
  const pedestalsRef = useRef<{ [key: string]: THREE.Mesh }>({});
  const haloRingsRef = useRef<{ [key: string]: THREE.Mesh }>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // M3 GLB upgrade bookkeeping: pending loads are ignored once the effect
    // is torn down, and successfully loaded models are disposed on cleanup.
    let disposed = false;
    const glbModels: THREE.Object3D[] = [];

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x180b06, 0.04);

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      60
    );
    camera.position.set(0, 2.5, 7.5);
    camera.lookAt(0, 0.8, 0);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Lighting (Chamber of Kings)
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.9);
    scene.add(ambientLight);

    const mainOverhead = new THREE.DirectionalLight(0xffdf99, 2.2);
    mainOverhead.position.set(0, 8, 4);
    mainOverhead.castShadow = true;
    scene.add(mainOverhead);

    const warmRim = new THREE.DirectionalLight(0xb8860b, 1.4);
    warmRim.position.set(-5, 3, -4);
    scene.add(warmRim);

    // 5. Grand Circular Chamber Floor
    const floorGeo = new THREE.CylinderGeometry(8.5, 9, 0.5, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1f0e08,
      roughness: 0.2,
      metalness: 0.4
    });
    const chamberFloor = new THREE.Mesh(floorGeo, floorMat);
    chamberFloor.position.y = -1.2;
    chamberFloor.receiveShadow = true;
    scene.add(chamberFloor);

    // Circular Gold concentric inlays in the floor
    const inlayGeo = new THREE.RingGeometry(3.2, 3.4, 48);
    inlayGeo.rotateX(-Math.PI / 2);
    const inlayMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide });
    const inlay = new THREE.Mesh(inlayGeo, inlayMat);
    inlay.position.y = -0.94;
    scene.add(inlay);

    // 6. Pedestals & Floating Royal Chocolate Products
    const products = factory.products;
    const spacing = 2.7;

    products.forEach((prod, idx) => {
      const xPos = (idx - (products.length - 1) / 2) * spacing;
      const zPos = Math.abs(xPos) * 0.4; // Gentle arc towards camera

      // Royal Pedestal: Marble & Gold pillar with velvet top
      const pedGroup = new THREE.Group();
      pedGroup.position.set(xPos, -0.9, zPos);

      // Base cylinder
      const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.25, 24);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x3b1c0d,
        roughness: 0.3,
        metalness: 0.5
      });
      const pedBase = new THREE.Mesh(baseGeo, baseMat);
      pedGroup.add(pedBase);

      // Pillar stem
      const stemGeo = new THREE.CylinderGeometry(0.65, 0.7, 1.4, 24);
      const stemMat = new THREE.MeshStandardMaterial({
        color: 0x271107,
        roughness: 0.2,
        metalness: 0.6
      });
      const pedStem = new THREE.Mesh(stemGeo, stemMat);
      pedStem.position.y = 0.8;
      pedGroup.add(pedStem);

      // Golden ring collar
      const collarGeo = new THREE.TorusGeometry(0.72, 0.06, 12, 24);
      collarGeo.rotateX(Math.PI / 2);
      const collarMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.9,
        roughness: 0.2
      });
      const collar = new THREE.Mesh(collarGeo, collarMat);
      collar.position.y = 1.5;
      pedGroup.add(collar);

      // Velvet Cushion Top
      const velvetGeo = new THREE.CylinderGeometry(0.78, 0.72, 0.2, 24);
      const velvetMat = new THREE.MeshStandardMaterial({
        color: 0x7a1111,
        roughness: 0.9
      });
      const cushion = new THREE.Mesh(velvetGeo, velvetMat);
      cushion.position.y = 1.6;
      pedGroup.add(cushion);

      // Pedestal Halo ring (illuminates on hover)
      const haloGeo = new THREE.RingGeometry(0.95, 1.25, 32);
      haloGeo.rotateX(-Math.PI / 2);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xd4af37,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = 0.05;
      pedGroup.add(halo);
      haloRingsRef.current[prod.id] = halo;

      scene.add(pedGroup);

      // Product Model floating above pedestal
      const prodGroup = new THREE.Group();
      prodGroup.position.set(xPos, 1.4, zPos);
      prodGroup.userData = { product: prod };

      if (prod.type === 'box') {
        // Luxury Chocolate Box geometry
        const boxGeo = new THREE.BoxGeometry(1.4, 0.45, 1.1);
        const boxMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(prod.wrapperPrimaryColor),
          metalness: 0.4,
          roughness: 0.3
        });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.castShadow = true;
        prodGroup.add(box);

        // Gold Ribbon across box
        const ribbonGeo = new THREE.BoxGeometry(1.42, 0.47, 0.15);
        const ribbonMat = new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          metalness: 0.9,
          roughness: 0.2
        });
        const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
        prodGroup.add(ribbon);
      } else {
        // Sealed Chocolate Bar in Foil & Sleeve
        const barGeo = new THREE.BoxGeometry(1.1, 1.9, 0.18);
        const barMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(prod.wrapperPrimaryColor),
          roughness: 0.3,
          metalness: 0.35
        });
        const barMesh = new THREE.Mesh(barGeo, barMat);
        barMesh.castShadow = true;
        prodGroup.add(barMesh);

        // Gold foil peeking out from the ends
        const foilGeo = new THREE.BoxGeometry(1.14, 0.25, 0.2);
        const foilMat = new THREE.MeshStandardMaterial({
          color: 0xf1c40f,
          metalness: 0.95,
          roughness: 0.15
        });
        const foilTop = new THREE.Mesh(foilGeo, foilMat);
        foilTop.position.y = 0.9;
        prodGroup.add(foilTop);

        // Gold royal emblem crest on the bar
        const crestGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 16);
        crestGeo.rotateX(Math.PI / 2);
        const crestMat = new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          metalness: 0.9,
          roughness: 0.2
        });
        const crest = new THREE.Mesh(crestGeo, crestMat);
        crest.position.z = 0.1;
        prodGroup.add(crest);
      }

      // Snapshot of the procedural fallback meshes (hitbox excluded: it is
      // added below and must stay active for hover/click raycasting).
      const proceduralMeshes = [...prodGroup.children];

      // Hitbox for easy clicking
      const hitGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.5, 12);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.userData = { product: prod };
      prodGroup.add(hitMesh);

      scene.add(prodGroup);
      productMeshesRef.current[prod.id] = prodGroup;

      // M3: optional GLB upgrade. Attempts `/models/<sku>.glb` (sku = product
      // id), normalizes it to the product's real height (heightCm, assuming
      // 1 scene unit = 1 m — see glbProduct.ts) and swaps it in over the
      // procedural mesh, keeping embedded PBR materials untouched. ANY load
      // failure resolves to null and the procedural fallback stays visible,
      // so missing assets can never break the scene.
      void loadProductModel(prod.id, { heightCm: prod.heightCm }).then((model) => {
        if (disposed || !model) return;
        proceduralMeshes.forEach((mesh) => {
          mesh.visible = false;
        });
        prodGroup.add(model);
        glbModels.push(model);
      });
    });

    // 7. Raycasting for hover & click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      let found: ProductSpec | null = null;
      for (const hit of intersects) {
        let currentObj: THREE.Object3D | null = hit.object;
        while (currentObj && currentObj !== scene) {
          if (currentObj.userData?.product) {
            found = currentObj.userData.product;
            break;
          }
          currentObj = currentObj.parent;
        }
        if (found) break;
      }

      if (found !== hoveredProduct) {
        setHoveredProduct(found);
        if (found) {
          playPedestalHum();
        }
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const hit of intersects) {
        let currentObj: THREE.Object3D | null = hit.object;
        while (currentObj && currentObj !== scene) {
          if (currentObj.userData?.product) {
            onSelectProduct(currentObj.userData.product);
            return;
          }
          currentObj = currentObj.parent;
        }
      }
    };

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    container.addEventListener('mousemove', handlePointerMove);
    container.addEventListener('click', handlePointerDown);

    // 8. Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Gentle floating and spinning of products on their royal cushions
      products.forEach((prod, i) => {
        const mesh = productMeshesRef.current[prod.id];
        const halo = haloRingsRef.current[prod.id];
        if (!mesh) return;

        const isHovered = hoveredProduct?.id === prod.id;
        const hoverLift = isHovered ? 0.35 : 0;
        const bob = Math.sin(elapsed * 1.6 + i * 2) * 0.08;

        mesh.position.y = 1.35 + bob + hoverLift;
        mesh.rotation.y = elapsed * 0.4 + i * 0.8;
        mesh.rotation.x = Math.sin(elapsed * 0.8 + i) * 0.04;

        if (halo) {
          const targetOpacity = isHovered ? 0.9 : 0.15;
          (halo.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(
            (halo.material as THREE.MeshBasicMaterial).opacity,
            targetOpacity,
            0.1
          );
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handlePointerMove);
      container.removeEventListener('click', handlePointerDown);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      glbModels.forEach((obj) => {
        obj.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const material = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(material)) {
              material.forEach((m) => m.dispose());
            } else {
              material?.dispose();
            }
          }
        });
      });
      renderer.dispose();
    };
  }, [factory]);

  const bannerProduct = hoveredProduct;
  const bannerCommerce = bannerProduct ? toCommerce(bannerProduct) : null;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-[#1c0d07] via-[#241209] to-[#0e0503] select-none">
      
      {/* 3D Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0 cursor-pointer" />

      {/* Atmospheric lighting glow */}
      <div className="absolute inset-0 pointer-events-none bg-radial-[at_50%_35%] from-[#ffd700]/10 via-transparent to-[#0a0402]/85" />

      {/* Chamber Header */}
      <div className="absolute top-20 left-0 right-0 z-20 text-center pointer-events-none px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1c100a]/85 border border-[#d4af37]/40 backdrop-blur-md mb-2 shadow-xl"
        >
          <Crown className="w-4 h-4 text-[#d4af37]" />
          <span className="text-xs uppercase font-bold tracking-widest text-[#e5c158]">
            Sala Real de Productos • {factory.name}
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-2xl sm:text-4xl font-extrabold text-[#fcf8f2] tracking-tight font-royal"
        >
          Trono del Cacao Chuquisaqueño
        </motion.h2>

        <p className="mt-1.5 text-xs sm:text-sm text-[#d7c4b7] max-w-lg mx-auto">
          Cada producto descansa en su pedestal de honor. Selecciona cualquier tableta para <strong className="text-[#f1c40f]">desenvolverla en 3D</strong> y examinarla en 360°.
        </p>
      </div>

      {/* Selected/Hovered Product Showcase Banner */}
      <AnimatePresence>
        {hoveredProduct && (
          <motion.div
            key={hoveredProduct.id}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-xl pointer-events-auto"
          >
            <div className="bg-[#1c100a]/95 backdrop-blur-2xl border-2 border-[#d4af37]/50 rounded-2xl p-5 sm:p-6 shadow-2xl shadow-black/90">
              
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-[#d4af37] text-[#1a0f08]">
                      {hoveredProduct.badge || 'Edición Selecta'}
                    </span>
                    <span className="text-xs text-[#e5c158] font-bold">
                      {hoveredProduct.cacaoPercentage}% Cacao
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#fcf8f2] font-serif-luxury mt-1">
                    {hoveredProduct.name}
                  </h3>
                  <p className="text-xs text-[#bda393] italic font-serif-luxury">
                    {hoveredProduct.subtitle}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-sm font-bold text-[#f1c40f] block">
                    {hoveredProduct.weight}
                  </span>
                  <span className="text-[11px] text-[#8e786b]">
                    {hoveredProduct.dimensions}
                  </span>
                </div>
              </div>

              {/* Flavor Profile Pills */}
              <div className="flex flex-wrap gap-1.5 my-3">
                {hoveredProduct.flavorProfile.map((note, nIdx) => (
                  <span
                    key={nIdx}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#2e1910] text-[#e6d5c3] border border-[#d4af37]/20"
                  >
                    {note}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#d4af37]/20">
                <span className="text-xs text-[#bda393] flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span>Haz clic sobre el producto para desenvolver su empaque</span>
                </span>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* PR3 overlay add-to-cart (no RAF/scene changes) */}
                  {bannerCommerce && (
                    <button
                      onClick={() => add(bannerCommerce.sku, bannerCommerce.stock)}
                      disabled={bannerCommerce.stock <= 0}
                      title={bannerCommerce.stock <= 0 ? 'Sin stock' : `Añadir ${bannerProduct?.name} al carrito`}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#2e1910] hover:bg-[#3d2215] text-[#f1c40f] font-extrabold text-xs flex items-center gap-2 border border-[#d4af37]/40 active:scale-95 transition-all shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>{bannerCommerce.stock <= 0 ? 'Sin stock' : `Añadir · Bs ${bannerCommerce.priceBOB.toFixed(2)}`}</span>
                    </button>
                  )}
                  <button
                    onClick={() => onSelectProduct(hoveredProduct)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-xs flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#d4af37]/30 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Desenvolver en 3D</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {warning && <p role="alert" className="mt-2 text-[11px] text-[#f0a6a6]">{warning}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back to corridor button */}
      <div className="absolute top-20 left-6 z-20 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={onReturnToCorridor}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1c100a]/80 backdrop-blur-md text-xs text-[#e5c158] hover:text-[#fff] hover:bg-[#2b170e] border border-[#d4af37]/30 transition-all cursor-pointer shadow-lg"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Volver al Pasillo Histórico</span>
        </button>
      </div>

    </div>
  );
};
