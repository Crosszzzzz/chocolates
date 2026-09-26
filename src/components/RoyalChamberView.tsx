import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Sparkles, ArrowRight, Eye, ChevronLeft, Scan } from 'lucide-react';
import { ChocolateFactory, ProductSpec } from '../types/chocolate';
import { playPedestalHum } from '../utils/audio';
import { getModelPaths, loadGltfCached, normalizeBarModel, applyPbrEnvFix } from '../utils/models';

interface RoyalChamberViewProps {
  factory: ChocolateFactory;
  onSelectProduct: (product: ProductSpec) => void;
  onReturnToCorridor: () => void;
  onReturnToArchipelago: () => void;
  /** Open the WebXR AR experience for a product. */
  onOpenAr: (product: ProductSpec) => void;
}

/** Minimum ms between pedestal hover hums so a sweep doesn't spam audio. */
const HUM_THROTTLE_MS = 350;

export const RoyalChamberView: React.FC<RoyalChamberViewProps> = ({
  factory,
  onSelectProduct,
  onReturnToCorridor,
  onReturnToArchipelago,
  onOpenAr
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredProduct, setHoveredProduct] = useState<ProductSpec | null>(null);

  // Ref mirrors so RAF/pointer handlers never read stale React state.
  const hoveredProductRef = useRef<ProductSpec | null>(null);
  const lastTappedIdRef = useRef<string | null>(null);
  const lastHumTimeRef = useRef(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const productMeshesRef = useRef<{ [key: string]: THREE.Group }>({});
  const haloRingsRef = useRef<{ [key: string]: THREE.Mesh }>({});
  const placeholderVisualsRef = useRef<{ [key: string]: THREE.Object3D[] }>({});

  // Keep latest callbacks without re-running the heavy scene effect
  // (App recreates these handlers on every render).
  const onSelectProductRef = useRef(onSelectProduct);
  onSelectProductRef.current = onSelectProduct;
  const onOpenArRef = useRef(onOpenAr);
  onOpenArRef.current = onOpenAr;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x180b06, 0.04);

    // 2. Camera Setup (FOV/position recalculated on resize for narrow screens)
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Lighting (Chamber of Kings)
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.9);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfff5e6, 0x2a140a, 0.6);
    scene.add(hemiLight);

    // IBL so metalness-heavy GLB foil never renders black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

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

    const inlayGeo = new THREE.RingGeometry(3.2, 3.4, 48);
    inlayGeo.rotateX(-Math.PI / 2);
    const inlayMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide });
    const inlay = new THREE.Mesh(inlayGeo, inlayMat);
    inlay.position.y = -0.94;
    scene.add(inlay);

    // Floating Gold Dust / Aura
    const dustCount = 350;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 16;
      dustPos[i * 3 + 1] = Math.random() * 5 - 0.5;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xf1c40f,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // 6. Pedestals & Floating Royal Chocolate Products
    const products = factory.products;
    const spacing = 2.7;

    const registerPlaceholder = (prodId: string, obj: THREE.Object3D) => {
      const list = placeholderVisualsRef.current[prodId] ?? [];
      list.push(obj);
      placeholderVisualsRef.current[prodId] = list;
    };

    products.forEach((prod, idx) => {
      const xPos = (idx - (products.length - 1) / 2) * spacing;
      const zPos = Math.abs(xPos) * 0.4;

      // Royal Pedestal: Marble & Gold pillar with velvet top
      const pedGroup = new THREE.Group();
      pedGroup.position.set(xPos, -0.9, zPos);

      const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.25, 24);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x3b1c0d,
        roughness: 0.3,
        metalness: 0.5
      });
      const pedBase = new THREE.Mesh(baseGeo, baseMat);
      pedGroup.add(pedBase);

      const stemGeo = new THREE.CylinderGeometry(0.65, 0.7, 1.4, 24);
      const stemMat = new THREE.MeshStandardMaterial({
        color: 0x271107,
        roughness: 0.2,
        metalness: 0.6
      });
      const pedStem = new THREE.Mesh(stemGeo, stemMat);
      pedStem.position.y = 0.8;
      pedGroup.add(pedStem);

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

      const velvetGeo = new THREE.CylinderGeometry(0.78, 0.72, 0.2, 24);
      const velvetMat = new THREE.MeshStandardMaterial({
        color: 0x7a1111,
        roughness: 0.9
      });
      const cushion = new THREE.Mesh(velvetGeo, velvetMat);
      cushion.position.y = 1.6;
      pedGroup.add(cushion);

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
        // Luxury Chocolate Box — procedural (no box GLB available)
        const boxGeo = new THREE.BoxGeometry(1.4, 0.45, 1.1);
        const boxMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(prod.wrapperPrimaryColor),
          metalness: 0.4,
          roughness: 0.3
        });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.castShadow = true;
        prodGroup.add(box);

        const ribbonGeo = new THREE.BoxGeometry(1.42, 0.47, 0.15);
        const ribbonMat = new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          metalness: 0.9,
          roughness: 0.2
        });
        const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
        prodGroup.add(ribbon);
      } else {
        // Procedural placeholder bar — shown until the GLB resolves
        const barGeo = new THREE.BoxGeometry(1.1, 1.9, 0.18);
        const barMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(prod.wrapperPrimaryColor),
          roughness: 0.3,
          metalness: 0.35
        });
        const barMesh = new THREE.Mesh(barGeo, barMat);
        barMesh.castShadow = true;
        prodGroup.add(barMesh);
        registerPlaceholder(prod.id, barMesh);

        const foilGeo = new THREE.BoxGeometry(1.14, 0.25, 0.2);
        const foilMat = new THREE.MeshStandardMaterial({
          color: 0xf1c40f,
          metalness: 0.95,
          roughness: 0.15
        });
        const foilTop = new THREE.Mesh(foilGeo, foilMat);
        foilTop.position.y = 0.9;
        prodGroup.add(foilTop);
        registerPlaceholder(prod.id, foilTop);

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
        registerPlaceholder(prod.id, crest);
      }

      // Hitbox for easy clicking (stays after GLB swap)
      const hitGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.5, 12);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.userData = { product: prod };
      prodGroup.add(hitMesh);

      scene.add(prodGroup);
      productMeshesRef.current[prod.id] = prodGroup;
    });

    // 6b. Load wrapped GLB models for bar products (cached + cloned per pedestal).
    // Procedural placeholders remain visible until this resolves — never blocks the room.
    const barProducts = products.filter((p) => p.type !== 'box');
    if (barProducts.length > 0) {
      const paths = getModelPaths(barProducts[0]);
      loadGltfCached(paths.glb)
        .then((gltf) => {
          if (disposed) return;
          barProducts.forEach((prod) => {
            const target = productMeshesRef.current[prod.id];
            if (!target) return;

            // Drop placeholder visuals, keep the invisible hitbox.
            const placeholders = placeholderVisualsRef.current[prod.id] ?? [];
            placeholders.forEach((obj) => {
              if (obj.parent) obj.parent.remove(obj);
            });
            placeholderVisualsRef.current[prod.id] = [];

            const holder = new THREE.Group();
            const clone = gltf.scene.clone(true);
            applyPbrEnvFix(clone);
            holder.add(clone);
            // Fit inside the old ~1.1 x 1.9 x 0.18 envelope (longest side = 1.9).
            normalizeBarModel(clone, 1.9, 'upright');
            target.add(holder);
          });
        })
        .catch((err) => {
          // Keep procedural placeholders on failure.
          console.debug('GLB bar load failed, keeping placeholders:', err);
        });
    }

    // 7. Raycasting for hover & tap
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const pickProduct = (clientX: number, clientY: number): ProductSpec | null => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const hit of intersects) {
        let currentObj: THREE.Object3D | null = hit.object;
        while (currentObj && currentObj !== scene) {
          if (currentObj.userData?.product) {
            return currentObj.userData.product as ProductSpec;
          }
          currentObj = currentObj.parent;
        }
      }
      return null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const found = pickProduct(e.clientX, e.clientY);
      if (found?.id !== hoveredProductRef.current?.id) {
        hoveredProductRef.current = found;
        setHoveredProduct(found);
        if (found) {
          const now = performance.now();
          if (now - lastHumTimeRef.current > HUM_THROTTLE_MS) {
            lastHumTimeRef.current = now;
            playPedestalHum();
          }
        } else {
          lastTappedIdRef.current = null;
        }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Keep tracking coherent for touch drags.
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }

      const found = pickProduct(e.clientX, e.clientY);
      if (!found) {
        // Tap on empty floor dismisses the touch banner.
        lastTappedIdRef.current = null;
        hoveredProductRef.current = null;
        setHoveredProduct(null);
        return;
      }

      const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (isTouch) {
        // First tap shows the info banner; second tap (or CTA) navigates.
        if (lastTappedIdRef.current === found.id) {
          onSelectProductRef.current(found);
        } else {
          lastTappedIdRef.current = found.id;
          hoveredProductRef.current = found;
          setHoveredProduct(found);
          playPedestalHum();
        }
      } else {
        onSelectProductRef.current(found);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      try {
        if (container.hasPointerCapture(e.pointerId)) {
          container.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors.
      }
    };

    // Frame the whole circular layout even on narrow (portrait) aspects.
    const handleResize = () => {
      if (!renderer || !camera) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      const aspect = w / h;

      camera.aspect = aspect;
      // Widen FOV a touch in portrait to reduce how far we must dolly back.
      camera.fov = aspect < 1 ? 54 : 45;
      camera.updateProjectionMatrix();

      // Outer pedestals sit at |x| ≈ 2.7 (+ pedestal radius) — keep them framed.
      const halfWidthNeeded = 3.7;
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      const neededZ = halfWidthNeeded / Math.max(Math.tan(hHalf), 0.0001);
      camera.position.z = THREE.MathUtils.clamp(Math.max(7.5, neededZ * 1.04), 7.5, 16);
      camera.lookAt(0, 0.8, 0);

      renderer.setSize(w, h);
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);

    // 8. Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      products.forEach((prod, i) => {
        const mesh = productMeshesRef.current[prod.id];
        const halo = haloRingsRef.current[prod.id];
        if (!mesh) return;

        // Read from the ref — never from React state captured at effect setup.
        const isHovered = hoveredProductRef.current?.id === prod.id;
        const hoverLift = isHovered ? 0.35 : 0;
        const bob = Math.sin(elapsed * 1.6 + i * 2) * 0.08;

        mesh.position.y = 1.35 + bob + hoverLift;
        mesh.rotation.y = elapsed * 0.4 + i * 0.8;
        mesh.rotation.x = Math.sin(elapsed * 0.8 + i) * 0.04;

        if (halo) {
          const targetOpacity = isHovered ? 0.9 : 0.15;
          const mat = halo.material as THREE.MeshBasicMaterial;
          mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.1);
        }
      });

      dust.rotation.y = elapsed * 0.03;
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      // Do NOT dispose geometries/materials of cached GLTF clones — they are shared.
      productMeshesRef.current = {};
      haloRingsRef.current = {};
      placeholderVisualsRef.current = {};
      if (scene.environment) {
        (scene.environment as THREE.Texture).dispose();
        scene.environment = null;
      }
      renderer.dispose();
    };
    // Callbacks are read via refs — the scene only rebuilds when the factory changes.
  }, [factory]);

  const bannerProduct = hoveredProduct;

  return (
    <div className="relative w-full h-app overflow-hidden bg-gradient-to-b from-[#1c0d07] via-[#241209] to-[#0e0503] select-none">
      {/* 3D Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0 cursor-pointer touch-none" />

      {/* Atmospheric lighting glow */}
      <div className="absolute inset-0 pointer-events-none bg-radial-[at_50%_35%] from-[#ffd700]/10 via-transparent to-[#0a0402]/85" />

      {/* Chamber Header — pushed below the back button row on mobile */}
      <div className="absolute top-20 left-0 right-0 z-20 text-center pointer-events-none px-4 pt-12 sm:pt-0">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1c100a]/85 border border-[#d4af37]/40 backdrop-blur-md mb-2 shadow-xl max-w-full"
        >
          <Crown className="w-4 h-4 text-[#d4af37] flex-shrink-0" />
          <span className="text-xs uppercase font-bold tracking-widest text-[#e5c158] truncate">
            Sala Real de Productos
            <span className="hidden sm:inline"> • {factory.name}</span>
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-xl sm:text-4xl font-extrabold text-[#fcf8f2] tracking-tight font-royal"
        >
          Trono del Cacao Chuquisaqueño
        </motion.h2>

        <p className="mt-1.5 text-xs sm:text-sm text-[#d7c4b7] max-w-lg mx-auto">
          Cada producto descansa en su pedestal de honor. Selecciona cualquier tableta para{' '}
          <strong className="text-[#f1c40f]">desenvolverla en 3D</strong> y examinarla en 360°.
        </p>
      </div>

      {/* Selected/Hovered Product Showcase Banner */}
      <AnimatePresence>
        {bannerProduct && (
          <motion.div
            key={bannerProduct.id}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-xl pointer-events-auto"
          >
            <div className="bg-[#1c100a]/95 backdrop-blur-2xl border-2 border-[#d4af37]/50 rounded-2xl p-4 sm:p-6 shadow-2xl shadow-black/90">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-[#d4af37] text-[#1a0f08]">
                      {bannerProduct.badge || 'Edición Selecta'}
                    </span>
                    <span className="text-xs text-[#e5c158] font-bold">
                      {bannerProduct.cacaoPercentage}% Cacao
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-2xl font-bold text-[#fcf8f2] font-serif-luxury mt-1 truncate">
                    {bannerProduct.name}
                  </h3>
                  <p className="text-xs text-[#bda393] italic font-serif-luxury truncate">
                    {bannerProduct.subtitle}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-bold text-[#f1c40f] block">
                    {bannerProduct.weight}
                  </span>
                  <span className="text-[11px] text-[#8e786b]">{bannerProduct.dimensions}</span>
                </div>
              </div>

              {/* Flavor Profile Pills */}
              <div className="flex flex-wrap gap-1.5 my-3">
                {bannerProduct.flavorProfile.map((note, nIdx) => (
                  <span
                    key={nIdx}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#2e1910] text-[#e6d5c3] border border-[#d4af37]/20"
                  >
                    {note}
                  </span>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#d4af37]/20">
                <span className="text-xs text-[#bda393] flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#d4af37] flex-shrink-0" />
                  <span className="hidden sm:inline">
                    Haz clic sobre el producto para desenvolver su empaque
                  </span>
                  <span className="sm:hidden">Toca el producto para desenvolverlo</span>
                </span>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onOpenAr(bannerProduct)}
                    className="px-4 py-2.5 rounded-xl bg-[#2e1910] hover:bg-[#3d2215] text-[#f1c40f] font-extrabold text-xs flex items-center gap-2 border border-[#d4af37]/40 active:scale-95 transition-all shadow-lg cursor-pointer"
                  >
                    <Scan className="w-4 h-4" />
                    <span>Ver en RA</span>
                  </button>

                  <button
                    onClick={() => onSelectProduct(bannerProduct)}
                    className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-xs flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#d4af37]/30 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Desenvolver en 3D</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back to corridor button — icon-only label on the smallest screens */}
      <div className="absolute top-20 left-4 sm:left-6 z-30 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={onReturnToCorridor}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1c100a]/80 backdrop-blur-md text-xs text-[#e5c158] hover:text-[#fff] hover:bg-[#2b170e] border border-[#d4af37]/30 transition-all cursor-pointer shadow-lg"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Volver al Pasillo Histórico</span>
          <span className="sm:hidden">Pasillo</span>
        </button>
      </div>
    </div>
  );
};
