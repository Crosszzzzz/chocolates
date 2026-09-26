import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Rotate3d,
  Sparkles,
  Scissors,
  RotateCcw,
  ArrowLeft,
  Award,
  CheckCircle2,
  Package,
  Layers,
  Scale,
  Maximize2,
  Scan
} from 'lucide-react';
import { ProductSpec, ChocolateFactory } from '../types/chocolate';
import { playFoilTearSound, playChocolateSnapSound } from '../utils/audio';
import { getModelPaths, loadGltfCached, normalizeBarModel, disposeObject, applyPbrEnvFix } from '../utils/models';
import {
  WrapperPiece,
  ShellDims,
  buildWrapperShell,
  createWrapperTexture,
  launchPiece,
  resetPieces,
  smoothstep,
  updatePiecePhysics,
  TEAR_PATH_PX,
  DENT_PATH_PX,
  MAX_TEAR_PER_GESTURE,
  TEAR_SOUND_THROTTLE
} from '../utils/wrapper';

interface UnwrappingModalViewProps {
  product: ProductSpec;
  factory: ChocolateFactory;
  onBackToChamber: () => void;
  /** Optional: open WebXR AR for this product (toolbar button). */
  onOpenAr?: (product: ProductSpec) => void;
  /**
   * Progress restored when returning from AR (0..1). Applied once on mount;
   * the view owns progress from then on and reports it via onProgressChange.
   */
  initialProgress?: number;
  onProgressChange?: (progress: number) => void;
}

/** Tear gesture tuning is shared with the AR view — see utils/wrapper.ts. */

export const UnwrappingModalView: React.FC<UnwrappingModalViewProps> = ({
  product,
  factory,
  onBackToChamber,
  onOpenAr,
  initialProgress = 0,
  onProgressChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unwrapProgress, setUnwrapProgress] = useState<number>(() =>
    Math.min(Math.max(initialProgress, 0), 1)
  );
  const [isFullyUnwrapped, setIsFullyUnwrapped] = useState<boolean>(initialProgress >= 1);
  const [isCoreLoading, setIsCoreLoading] = useState<boolean>(true);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const chocolateBarGroupRef = useRef<THREE.Group | null>(null);
  const coreGroupRef = useRef<THREE.Group | null>(null);
  const shellGroupRef = useRef<THREE.Group | null>(null);
  const wrapperPiecesRef = useRef<WrapperPiece[]>([]);
  const isInteractingRef = useRef<boolean>(false);
  /** True once the wrapped core was swapped for the real unwrapped GLB. */
  const coreSwappedRef = useRef<boolean>(false);

  // Mirrors for the RAF/pointer loop — never read React state from the effect.
  const fullyUnwrappedRef = useRef<boolean>(initialProgress >= 1);
  const coreReadyRef = useRef<boolean>(false);
  const progressRef = useRef<number>(Math.min(Math.max(initialProgress, 0), 1));
  const slideDistanceRef = useRef<number>(2.2);
  const userRotXRef = useRef(0);
  const userRotYRef = useRef(0);

  // Callbacks may change identity across renders — keep stable refs for the effect.
  const initialProgressRef = useRef(initialProgress);
  const onProgressChangeRef = useRef(onProgressChange);
  onProgressChangeRef.current = onProgressChange;

  // Report progress to App (so AR can resume from it).
  useEffect(() => {
    onProgressChangeRef.current?.(unwrapProgress);
  }, [unwrapProgress]);

  /**
   * Swap the wrapped core for the REAL unwrapped chocolate GLB and force-hide
   * the sleeve (even if a staggered tear-all left dented pieces visible).
   * The clone shares geometry/materials with the GLB cache, so the old core
   * is only detached — never disposed — unless it is the procedural fallback.
   */
  const swapCoreToUnwrapped = async () => {
    if (coreSwappedRef.current) return;
    coreSwappedRef.current = true;
    const coreGroup = coreGroupRef.current;
    const shellGroup = shellGroupRef.current;
    if (shellGroup) {
      for (const p of wrapperPiecesRef.current) {
        p.opacity = 0;
        if (p.mesh) p.mesh.visible = false;
      }
      shellGroup.visible = false;
    }
    if (!coreGroup) return;
    try {
      const gltf = await loadGltfCached(getModelPaths(product).glbUnwrapped);
      while (coreGroup.children.length > 0) {
        const child = coreGroup.children[0];
        coreGroup.remove(child);
        if (!coreGroup.userData.fromCache) disposeObject(child);
      }
      coreGroup.userData.fromCache = true;
      const clone = gltf.scene.clone(true);
      applyPbrEnvFix(clone);
      coreGroup.add(clone);
      normalizeBarModel(clone, 3.2, 'flat');
      coreGroup.position.x = 0;
    } catch (err) {
      console.debug('Unwrapped GLB swap failed, keeping wrapped core:', err);
      coreSwappedRef.current = false;
    }
  };

  /** Reverse of the unwrap swap: wrapped GLB back in, sleeve visible again. */
  const restoreWrappedCore = async () => {
    const coreGroup = coreGroupRef.current;
    const shellGroup = shellGroupRef.current;
    coreSwappedRef.current = false;
    if (shellGroup) shellGroup.visible = true;
    if (!coreGroup) return;
    try {
      const gltf = await loadGltfCached(getModelPaths(product).glb);
      while (coreGroup.children.length > 0) {
        const child = coreGroup.children[0];
        coreGroup.remove(child);
        if (!coreGroup.userData.fromCache) disposeObject(child);
      }
      coreGroup.userData.fromCache = true;
      const clone = gltf.scene.clone(true);
      applyPbrEnvFix(clone);
      coreGroup.add(clone);
      normalizeBarModel(clone, 3.2, 'flat');
      coreGroup.position.x = 0;
    } catch (err) {
      console.debug('Wrapped GLB restore failed:', err);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let coreLoadToken = 0;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      50
    );
    camera.position.set(0, 0.2, 5.2);
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

    // 4. Lighting for ultra-glossy realistic chocolate bar
    const ambient = new THREE.AmbientLight(0xffeedd, 0.9);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xfff5e6, 0x2a140a, 0.6);
    scene.add(hemi);

    // IBL so metalness-heavy GLB foil never renders black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.4);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xedd8be, 1.2);
    fillLight.position.set(-4, -2, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xd4af37, 2.0);
    rimLight.position.set(0, 4, -4);
    scene.add(rimLight);

    // 5. Bar group: core (GLB chocolate) + shell (tearable wrapper pieces)
    const barGroup = new THREE.Group();
    chocolateBarGroupRef.current = barGroup;
    scene.add(barGroup);

    const coreGroup = new THREE.Group();
    coreGroupRef.current = coreGroup;
    barGroup.add(coreGroup);

    const shellGroup = new THREE.Group();
    shellGroupRef.current = shellGroup;
    barGroup.add(shellGroup);

    const wrapperTex = createWrapperTexture(product, factory);

    /** Shared completion path (GLB tears + tear-all button). */
    const completeUnwrap = () => {
      if (fullyUnwrappedRef.current) return;
      fullyUnwrappedRef.current = true;
      setIsFullyUnwrapped(true);
      playChocolateSnapSound();
      // Show the REAL unwrapped chocolate bar, not the wrapped core.
      void swapCoreToUnwrapped();
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#d4af37', '#f1c40f', '#5c3317', '#ffffff']
      });
    };

    const applyProgressState = (tornCount: number, total: number) => {
      const p = total > 0 ? tornCount / total : 0;
      progressRef.current = p;
      setUnwrapProgress(p);
      if (p >= 1) completeUnwrap();
    };

    /** Build sleeve around a known core size, then apply restored progress. */
    const setupShell = (dims: ShellDims) => {
      if (disposed) return;
      const pieces = buildWrapperShell(shellGroup, dims, wrapperTex);
      wrapperPiecesRef.current = pieces;
      slideDistanceRef.current = dims.width * 0.75;
      coreReadyRef.current = true;
      setIsCoreLoading(false);

      // Restore progress passed from a previous AR visit (hide pre-torn pieces).
      const initP = Math.min(Math.max(initialProgressRef.current, 0), 1);
      if (initP > 0 && pieces.length > 0) {
        const n = Math.floor(initP * pieces.length);
        const capped = initP >= 1 ? pieces.length : n;
        for (let i = 0; i < capped; i++) {
          launchPiece(pieces[i]);
          pieces[i].opacity = 0;
          pieces[i].mesh.visible = false;
        }
        applyProgressState(capped, pieces.length);
        if (capped < pieces.length) {
          fullyUnwrappedRef.current = false;
          setIsFullyUnwrapped(false);
        }
      }
    };

    /** Procedural fallback bar (landscape) if the GLB fails to load. */
    const buildFallbackCore = () => {
      const barWidth = 3.2;
      const barHeight = 1.9;
      const barDepth = 0.24;

      const chocolateMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(product.colorHex),
        roughness: 0.28,
        metalness: 0.04,
        clearcoat: 0.65,
        clearcoatRoughness: 0.15,
        reflectivity: 0.8
      });

      const baseSlab = new THREE.Mesh(
        new THREE.BoxGeometry(barWidth, barHeight, barDepth * 0.7),
        chocolateMat
      );
      baseSlab.castShadow = true;
      baseSlab.receiveShadow = true;
      coreGroup.add(baseSlab);

      const cols = 5;
      const rows = 3;
      const blockW = (barWidth - 0.2) / cols;
      const blockH = (barHeight - 0.18) / rows;
      const blockD = barDepth * 0.45;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = (c - (cols - 1) / 2) * blockW;
          const y = (r - (rows - 1) / 2) * blockH;
          const blockMesh = new THREE.Mesh(
            new THREE.BoxGeometry(blockW * 0.9, blockH * 0.9, blockD),
            chocolateMat
          );
          blockMesh.position.set(x, y, barDepth * 0.45);
          blockMesh.castShadow = true;
          coreGroup.add(blockMesh);
        }
      }

      setupShell({ width: barWidth, height: barHeight, depth: barDepth });
    };

    // 6. Load the WRAPPED GLB core (foil modeled) under the tearable sleeve.
    // The real unwrapped bar (glbUnwrapped) swaps in on completeUnwrap().
    const token = ++coreLoadToken;
    const paths = getModelPaths(product);
    loadGltfCached(paths.glb)
      .then((gltf) => {
        if (disposed || token !== coreLoadToken) return;
        const clone = gltf.scene.clone(true);
        applyPbrEnvFix(clone);
        coreGroup.userData.fromCache = true;
        coreGroup.add(clone);
        // Flat, long axis -> X; longest side ~3.2 world units (matches framing).
        const size = normalizeBarModel(clone, 3.2, 'flat');
        setupShell({ width: size.x, height: size.y, depth: size.z });
      })
      .catch((err) => {
        if (disposed) return;
        console.debug('Wrapped GLB failed, using procedural fallback:', err);
        buildFallbackCore();
      });

    // 7. Raycasting & Interaction Handlers
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Gesture-local rate limiting (reset on every pointerdown).
    let gestureTornCount = 0;
    let lastSoundAt = 0;
    const lastPointer = { x: 0, y: 0 };

    const toNdc = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return mouse;
    };

    const tearPiece = (piece: WrapperPiece) => {
      if (piece.torn) return;
      launchPiece(piece);

      const now = performance.now();
      if (now - lastSoundAt > TEAR_SOUND_THROTTLE) {
        lastSoundAt = now;
        playFoilTearSound();
      }

      const pieces = wrapperPiecesRef.current;
      applyProgressState(pieces.filter((p) => p.torn).length, pieces.length);
    };

    /** Raycast the intact shell and advance per-piece path accumulation. */
    const processTearAt = (clientX: number, clientY: number, segLen: number) => {
      if (!coreReadyRef.current || fullyUnwrappedRef.current) return;
      if (gestureTornCount >= MAX_TEAR_PER_GESTURE) return;

      const pieces = wrapperPiecesRef.current;
      if (pieces.length === 0) return;

      toNdc(clientX, clientY);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(shellGroup.children, false);

      for (const hit of intersects) {
        const piece = pieces.find((p) => p.mesh === hit.object);
        if (!piece || piece.torn) continue;

        piece.pathAccum += segLen;

        // First contact: dent before tearing (resistance feel).
        if (!piece.dented && piece.pathAccum >= DENT_PATH_PX) {
          piece.dented = true;
          piece.mesh.position.z += 0.03;
          piece.mesh.rotation.z += (Math.random() - 0.5) * 0.06;
        }

        if (piece.pathAccum >= TEAR_PATH_PX && gestureTornCount < MAX_TEAR_PER_GESTURE) {
          gestureTornCount++;
          tearPiece(piece);
        }
        break; // one piece per sample keeps flicks modest
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // Best-effort pointer capture for touch drags.
      }

      isInteractingRef.current = true;
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      gestureTornCount = 0;

      const pieces = wrapperPiecesRef.current;
      pieces.forEach((p) => {
        if (!p.torn) p.pathAccum = 0;
      });
      // NOTE: do NOT capture barGroup.rotation into userRot here — while
      // wrapped, rotation includes idle wobble which would accumulate
      // as permanent drift across multiple tear gestures.
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isInteractingRef.current) {
        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
        return;
      }

      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      const segLen = Math.hypot(dx, dy);

      if (fullyUnwrappedRef.current) {
        // Free 360° orbit — driven by the ref, not stale React state.
        userRotYRef.current += dx * 0.012;
        userRotXRef.current += dy * 0.012;
      } else if (segLen > 0.5) {
        // Tear mode: sample current + path midpoint so fast flicks still hit.
        const midX = lastPointer.x + dx * 0.5;
        const midY = lastPointer.y + dy * 0.5;
        processTearAt(midX, midY, segLen * 0.5);
        processTearAt(e.clientX, e.clientY, segLen * 0.5);
      }

      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      isInteractingRef.current = false;
      gestureTornCount = 0;
      try {
        if (container.hasPointerCapture(e.pointerId)) {
          container.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors.
      }
    };

    // Reverse scroll re-wraps the bar.
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < -25) {
        rewrapPieces();
      }
    };

    const handleResize = () => {
      if (!renderer || !camera) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      // Keep the horizontal bar (3.2 wide, mid-slide up to ~+1.2) framed
      // even on narrow portrait viewports.
      const neededHalfW = 2.7;
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      camera.position.z = THREE.MathUtils.clamp(
        neededHalfW / Math.max(Math.tan(hHalf), 0.0001),
        4.5,
        14
      );

      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);
    container.addEventListener('wheel', handleWheel, { passive: true });
    handleResize();

    // 8. Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const interacting = isInteractingRef.current;
      const unwrapped = fullyUnwrappedRef.current;

      // Smooth core slide along the long axis ("a medio sacar").
      const core = coreGroupRef.current;
      if (core && coreReadyRef.current) {
        const targetSlide = unwrapped
          ? 0 // recenter when bare
          : smoothstep(0.3, 0.9, progressRef.current) * slideDistanceRef.current;
        core.position.x += (targetSlide - core.position.x) * 0.08;
      }

      if (barGroup) {
        if (!interacting) {
          if (unwrapped) {
            // Gentle idle spin after unwrap (user drag adds to userRotYRef).
            userRotYRef.current += 0.0035;
          }
          barGroup.position.y = Math.sin(elapsed * 1.4) * 0.06;
        }

        // User orbit is the base; idle wobble only when wrapped & idle —
        // so idle motion never fights an active drag.
        const idleWobbleY = !interacting && !unwrapped ? Math.sin(elapsed * 0.6) * 0.08 : 0;
        const idleWobbleX = !interacting && !unwrapped ? Math.sin(elapsed * 0.85) * 0.03 : 0;
        barGroup.rotation.y = userRotYRef.current + idleWobbleY;
        barGroup.rotation.x = userRotXRef.current + idleWobbleX;
      }

      updatePiecePhysics(wrapperPiecesRef.current);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      wrapperTex.dispose();
      wrapperPiecesRef.current = [];
      chocolateBarGroupRef.current = null;
      coreGroupRef.current = null;
      shellGroupRef.current = null;
      coreSwappedRef.current = false;
      // Best-effort cleanup of non-shared fallback meshes.
      if (coreGroup.children.length > 0 && !coreGroup.userData.fromCache) {
        disposeObject(coreGroup);
      }
      if (scene.environment) {
        (scene.environment as THREE.Texture).dispose();
        scene.environment = null;
      }
      renderer.dispose();
    };
    // onSelectProduct-style callbacks are intentionally not deps: this effect
    // only depends on the product/factory identity (matches codebase pattern).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, factory]);

  // --- Derived UI state ---
  const progressPct = Math.round(unwrapProgress * 100);
  const statusText = isFullyUnwrapped
    ? '¡Tableta desnuda! Arrastra para rotar 360°'
    : unwrapProgress === 0
      ? 'Envoltorio completo'
      : unwrapProgress < 0.45
        ? `Desenvolviendo: ${progressPct}%`
        : 'A medio sacar...';

  // Tear all wrapper pieces automatically (staggered).
  const tearAll = () => {
    const pieces = wrapperPiecesRef.current;
    pieces.forEach((piece, idx) => {
      setTimeout(() => {
        if (!piece.torn) {
          launchPiece(piece);
          if (idx % 3 === 0) playFoilTearSound();
          const torn = pieces.filter((p) => p.torn).length;
          const p = torn / pieces.length;
          progressRef.current = p;
          setUnwrapProgress(p);
        }
      }, idx * 55);
    });

    setTimeout(() => {
      progressRef.current = 1;
      setUnwrapProgress(1);
      fullyUnwrappedRef.current = true;
      setIsFullyUnwrapped(true);
      playChocolateSnapSound();
      // Force-hide every sleeve piece (stagger leftovers included), then
      // swap in the REAL unwrapped chocolate bar.
      for (const piece of pieces) {
        piece.opacity = 0;
        if (piece.mesh) piece.mesh.visible = false;
      }
      if (shellGroupRef.current) shellGroupRef.current.visible = false;
      void swapCoreToUnwrapped();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#d4af37', '#f1c40f', '#5c3317', '#ffffff']
      });
    }, pieces.length * 55 + 100);
  };

  // Re-wrap pieces back in reverse.
  const rewrapPieces = () => {
    const pieces = wrapperPiecesRef.current;
    resetPieces(pieces);
    // Wrapped chocolate back in, sleeve visible again.
    void restoreWrappedCore();

    if (chocolateBarGroupRef.current) {
      chocolateBarGroupRef.current.rotation.set(0, 0, 0);
    }
    if (coreGroupRef.current) {
      coreGroupRef.current.position.x = 0;
    }
    userRotXRef.current = 0;
    userRotYRef.current = 0;
    fullyUnwrappedRef.current = false;
    progressRef.current = 0;

    setUnwrapProgress(0);
    setIsFullyUnwrapped(false);
    playFoilTearSound();
  };

  return (
    <div className="relative w-full h-app overflow-hidden bg-gradient-to-b from-[#180b06] via-[#1f0e08] to-[#0d0503] select-none flex flex-col md:flex-row">
      {/* 3D Canvas Area — flex child that can actually shrink on mobile */}
      <div className="relative flex-[1.15] md:flex-1 min-h-0 w-full">
        <div
          ref={containerRef}
          className={`w-full h-full touch-none ${
            isFullyUnwrapped ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
          }`}
        />

        {/* Loading overlay — never blocks the rest of the UI */}
        <AnimatePresence>
          {isCoreLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#120a06]/60 backdrop-blur-sm pointer-events-none"
            >
              <div className="w-10 h-10 rounded-full border-2 border-[#d4af37]/30 border-t-[#f1c40f] animate-spin" />
              <span className="text-xs font-semibold text-[#e5c158] tracking-wider uppercase">
                Cargando tableta...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Controls & Interactive Instruction on top of canvas */}
        <div className="absolute top-20 left-4 right-4 sm:left-6 sm:right-6 z-20 flex items-start justify-between gap-2 pointer-events-none">
          <button
            onClick={onBackToChamber}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1c100a]/90 backdrop-blur-md text-xs text-[#e5c158] hover:text-[#fff] hover:bg-[#2b170e] border border-[#d4af37]/30 transition-all pointer-events-auto cursor-pointer shadow-lg shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Volver a la Sala Real</span>
            <span className="sm:hidden">Sala</span>
          </button>

          {/* Interactive State Badge */}
          <div className="pointer-events-auto min-w-0 max-w-[60%] sm:max-w-none">
            {!isFullyUnwrapped ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c100a]/90 border border-[#d4af37]/40 text-[11px] sm:text-xs text-[#f1c40f] backdrop-blur-md shadow-lg">
                <Scissors className="w-3.5 h-3.5 animate-pulse text-[#d4af37] shrink-0" />
                <span className="font-semibold truncate">{statusText}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c100a]/90 border border-[#22c55e]/40 text-[11px] sm:text-xs text-[#4ade80] backdrop-blur-md shadow-lg">
                <Rotate3d className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="font-semibold truncate">{statusText}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Interactive Toolbar */}
        <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
          {!isFullyUnwrapped ? (
            <button
              onClick={tearAll}
              disabled={isCoreLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2e1910] hover:bg-[#3d2215] text-xs font-bold text-[#e5c158] border border-[#d4af37]/30 shadow-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Rasgar Envoltorio Rápido</span>
            </button>
          ) : (
            <button
              onClick={rewrapPieces}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2e1910] hover:bg-[#3d2215] text-xs font-bold text-[#e5c158] border border-[#d4af37]/30 shadow-xl transition-all cursor-pointer"
              title="Volver a envolver la tableta de chocolate"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Volver a envolver</span>
            </button>
          )}

          {onOpenAr && (
            <button
              onClick={() => onOpenAr(product)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2e1910] hover:bg-[#3d2215] text-xs font-bold text-[#f1c40f] border border-[#d4af37]/40 shadow-xl transition-all cursor-pointer"
              title="Ver la tableta en RA sobre una superficie real"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Ver en RA</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1c100a]/80 text-[11px] text-[#a08575] border border-[#d4af37]/15 backdrop-blur-sm">
            <span>Arrastra con el dedo o el mouse · rueda hacia atrás para reenvolver</span>
          </div>

          {/* Mobile-only compact tear hint */}
          {!isFullyUnwrapped && (
            <div className="sm:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1c100a]/80 text-[11px] text-[#a08575] border border-[#d4af37]/15 backdrop-blur-sm">
              <span>Arrastra con el dedo o el mouse para romper</span>
            </div>
          )}
        </div>
      </div>

      {/* Product Specification & Heritage Card (Side Panel) */}
      <motion.aside
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full md:w-[420px] lg:w-[460px] flex-1 md:flex-none min-h-0 md:h-full bg-[#180c07]/95 backdrop-blur-2xl border-t md:border-t-0 md:border-l border-[#d4af37]/30 p-5 sm:p-6 md:p-8 flex flex-col justify-between overflow-y-auto z-20 shadow-2xl shadow-black"
      >
        <div>
          {/* Badge & Factory */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase font-extrabold tracking-widest text-[#d4af37] flex items-center gap-1.5 truncate">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{factory.name}</span>
            </span>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#d4af37]/15 text-[#f1c40f] border border-[#d4af37]/30 shrink-0">
              {product.badge || 'Edición Suprema'}
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-[#fcf8f2] font-serif-luxury leading-tight mb-1">
            {product.name}
          </h2>

          <p className="text-xs text-[#bda393] italic font-serif-luxury mb-4">
            {product.subtitle}
          </p>

          <p className="text-xs text-[#d7c4b7] leading-relaxed mb-5">{product.description}</p>

          {/* Technical Specs Grid */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <div className="p-3 rounded-xl bg-[#25130b] border border-[#d4af37]/20">
              <div className="flex items-center gap-1.5 text-[#bda393] text-[11px] mb-1">
                <Scale className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Peso Neto</span>
              </div>
              <span className="text-sm font-bold text-[#fcf8f2]">{product.weight}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#25130b] border border-[#d4af37]/20">
              <div className="flex items-center gap-1.5 text-[#bda393] text-[11px] mb-1">
                <Maximize2 className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Dimensiones</span>
              </div>
              <span className="text-sm font-bold text-[#fcf8f2]">{product.dimensions}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#25130b] border border-[#d4af37]/20">
              <div className="flex items-center gap-1.5 text-[#bda393] text-[11px] mb-1">
                <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Pureza de Cacao</span>
              </div>
              <span className="text-sm font-bold text-[#f1c40f]">{product.cacaoPercentage}% Cacao</span>
            </div>

            <div className="p-3 rounded-xl bg-[#25130b] border border-[#d4af37]/20">
              <div className="flex items-center gap-1.5 text-[#bda393] text-[11px] mb-1">
                <Package className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Terroir de Origen</span>
              </div>
              <span className="text-xs font-bold text-[#fcf8f2] truncate block">
                {product.origin}
              </span>
            </div>
          </div>

          {/* Tasting Notes */}
          <div className="mb-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#d4af37] mb-2 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" />
              <span>Perfil de Cata & Aromas</span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {product.flavorProfile.map((f, i) => (
                <span
                  key={i}
                  className="text-xs px-3 py-1 rounded-lg bg-[#2e1910] text-[#e6d5c3] border border-[#d4af37]/25 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3 h-3 text-[#d4af37]" />
                  <span>{f}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Recommended Pairing */}
          <div className="p-3.5 rounded-xl bg-[#2b170e] border-l-2 border-[#d4af37] text-xs text-[#e6d5c3] mb-4">
            <span className="text-[#f1c40f] font-bold block mb-1">Maridaje Sugerido:</span>
            <span>{product.pairing}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-[#d4af37]/20 flex items-center justify-between">
          <button
            onClick={onBackToChamber}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#d4af37]/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-center"
          >
            Explorar Otros Productos de {factory.name}
          </button>
        </div>
      </motion.aside>
    </div>
  );
};
