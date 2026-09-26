import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { X, Scan, Move3d, RotateCcw, Hand, Smartphone } from 'lucide-react';
import { ChocolateFactory, ProductSpec } from '../types/chocolate';
import { playFoilTearSound, playChocolateSnapSound } from '../utils/audio';
import {
  getModelPaths,
  loadGltfCached,
  normalizeBarModel,
  parseDimensionsToMeters,
  applyPbrEnvFix
} from '../utils/models';
import {
  WrapperPiece,
  ShellDims,
  buildWrapperShell,
  createWrapperTexture,
  launchPiece,
  smoothstep,
  updatePiecePhysics,
  TEAR_PATH_PX,
  DENT_PATH_PX,
  MAX_TEAR_PER_GESTURE,
  TEAR_SOUND_THROTTLE
} from '../utils/wrapper';

interface ArExperienceViewProps {
  product: ProductSpec;
  factory: ChocolateFactory;
  /**
   * Unwrap progress carried over from the 3D unwrap view (0..1).
   * Progress STARTS from this value in AR (preferred over resetting),
   * and continues to be owned by App via onProgressChange.
   */
  initialProgress?: number;
  onProgressChange?: (progress: number) => void;
  /** Return to the previous phase (chamber or unwrap). */
  onBack: () => void;
}

type SupportState = 'checking' | 'supported' | 'unsupported';

/** ms the model must be held before a move gesture starts. */
const LONG_PRESS_MS = 1000;
/** Max movement (px) still counted as a hold (vs a drag). */
const LONG_PRESS_SLOP_PX = 14;

/** Hard cap so a mis-authored GLB never renders person-sized in AR. */
const MAX_REAL_M = 0.2;

interface NormalizedCore {
  clone: THREE.Object3D;
  /** Bbox in assembly-local units (longest == targetLongest). */
  localSize: THREE.Vector3;
}

/**
 * Clone + normalize a GLB scene under an identity staging parent, per the
 * normalizeBarModel contract (world == local when called). Both the initial
 * load and the unwrap-swap go through here: one assembly, one clamp, and no
 * re-scale ever happens on tap / auto-place / anchor-follow.
 */
function prepareNormalizedCore(
  source: THREE.Object3D,
  targetLongest: number
): NormalizedCore {
  const staging = new THREE.Group();
  const clone = source.clone(true);
  applyPbrEnvFix(clone);
  staging.add(clone);
  staging.updateMatrixWorld(true);
  const localSize = normalizeBarModel(clone, targetLongest, 'flat');
  // Object3D.add() reparents preserving the local transform; staging is discarded.
  return { clone, localSize };
}

/**
 * Single real-world clamp, owned deterministically (set, never multiplied):
 * world longest == min(local longest, MAX_REAL_M). Returns the world size.
 */
function applyRealWorldClamp(
  assembly: THREE.Object3D | null,
  localSize: THREE.Vector3
): THREE.Vector3 {
  const s = Math.min(1, MAX_REAL_M / Math.max(localSize.x, 1e-6));
  if (assembly) assembly.scale.setScalar(s);
  return localSize.clone().multiplyScalar(assembly ? assembly.scale.x : 1);
}

export const ArExperienceView: React.FC<ArExperienceViewProps> = ({
  product,
  factory,
  initialProgress = 0,
  onProgressChange,
  onBack
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const gestureLayerRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  const [support, setSupport] = useState<SupportState>('checking');
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [moving, setMoving] = useState(false);
  const [longPressPct, setLongPressPct] = useState(0);
  const [isCoreLoading, setIsCoreLoading] = useState(true);
  const [progress, setProgress] = useState(() =>
    Math.min(Math.max(initialProgress, 0), 1)
  );
  const [fullyUnwrapped, setFullyUnwrapped] = useState(initialProgress >= 1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- three.js refs ---
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const coreGroupRef = useRef<THREE.Group | null>(null);
  const shellGroupRef = useRef<THREE.Group | null>(null);
  const piecesRef = useRef<WrapperPiece[]>([]);
  const xrSessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const lastHitPosRef = useRef(new THREE.Vector3());
  const hasHitRef = useRef(false);
  const isPlacedRef = useRef(false);
  const movingRef = useRef(false);
  const fullyUnwrappedRef = useRef(initialProgress >= 1);
  const coreReadyRef = useRef(false);
  const progressRef = useRef(Math.min(Math.max(initialProgress, 0), 1));
  const userYawRef = useRef(0);
  const lastSoundAtRef = useRef(0);
  const gestureTornRef = useRef(0);
  const slideDistanceRef = useRef(0.1);
  const physScaleRef = useRef(0.05);
  const initProgressRef = useRef(initialProgress);
  const onProgressChangeRef = useRef(onProgressChange);
  onProgressChangeRef.current = onProgressChange;
  /** True once the wrapped core was swapped for the real unwrapped GLB. */
  const coreSwappedRef = useRef(false);
  /** XR session clock for the auto-place fallback + anchor bookkeeping. */
  const sessionT0Ref = useRef(0);
  const autoPlacedRef = useRef(false);
  const anchorRef = useRef<any>(null);
  const frameRef = useRef<XRFrame | null>(null);
  const assemblyRef = useRef<THREE.Group | null>(null);
  /** Last normalized WORLD size (meters), for placement lift + the temp scale log. */
  const placedSizeRef = useRef(new THREE.Vector3());
  /**
   * Locked assembly scale taken right after normalize+clamp (load/swap only).
   * Restored every frame after placement so no hit/anchor matrix can rescale
   * the bar (position + yaw only — never scale/quaternion from XR poses).
   */
  const lockedScaleRef = useRef(new THREE.Vector3(1, 1, 1));
  const lockedScaleReadyRef = useRef(false);

  // Gesture state (pointer-driven; XR select only handles first placement).
  const gestureRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pressStartedAt: 0,
    moved: false,
    longPressFired: false
  });
  const pressRafRef = useRef<number | null>(null);

  const paths = getModelPaths(product);
  const dims = parseDimensionsToMeters(product.dimensions);

  /**
   * Swap the wrapped AR core for the REAL unwrapped chocolate GLB and
   * force-hide the sleeve. Same contract as the 3D unwrap view: the old
   * clone is only detached (it shares geometry/materials with the GLB cache).
   */
  const swapArCoreToUnwrapped = useCallback(async () => {
    if (coreSwappedRef.current) return;
    coreSwappedRef.current = true;
    const coreGroup = coreGroupRef.current;
    const shellGroup = shellGroupRef.current;
    if (shellGroup) {
      for (const p of piecesRef.current) {
        p.opacity = 0;
        if (p.mesh) p.mesh.visible = false;
      }
      shellGroup.visible = false;
    }
    if (!coreGroup) return;
    try {
      const gltf = await loadGltfCached(getModelPaths(product).glbUnwrapped);
      while (coreGroup.children.length > 0) {
        coreGroup.remove(coreGroup.children[0]);
      }
      coreGroup.position.x = 0;
      // Same single-assembly path as the initial load: normalize under
      // identity, re-attach, re-apply the clamp deterministically.
      const { clone, localSize } = prepareNormalizedCore(gltf.scene, dims.length);
      coreGroup.add(clone);
      const assembly = coreGroup.parent;
      const world = applyRealWorldClamp(assembly, localSize);
      placedSizeRef.current.copy(world);
      if (assembly) {
        lockedScaleRef.current.copy(assembly.scale);
        lockedScaleReadyRef.current = true;
      }
      if (assembly) assembly.position.y = world.y / 2;
      slideDistanceRef.current = world.x * 0.75;
      coreGroup.position.x = 0;
    } catch (err) {
      console.debug('AR unwrapped GLB swap failed, keeping wrapped core:', err);
      coreSwappedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const applyProgress = useCallback((tornCount: number, total: number) => {
    const p = total > 0 ? tornCount / total : 0;
    progressRef.current = p;
    setProgress(p);
    onProgressChangeRef.current?.(p);
    if (p >= 1 && !fullyUnwrappedRef.current) {
      fullyUnwrappedRef.current = true;
      setFullyUnwrapped(true);
      playChocolateSnapSound();
      // Show the REAL unwrapped chocolate bar, not the wrapped core.
      void swapArCoreToUnwrapped();
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#d4af37', '#f1c40f', '#5c3317', '#ffffff']
      });
    }
  }, [swapArCoreToUnwrapped]);

  // Ref mirror so the three.js effect (keyed on product/factory) can trigger
  // the swap without a stale closure.
  const swapArCoreToUnwrappedRef = useRef<() => void>(() => undefined);
  swapArCoreToUnwrappedRef.current = swapArCoreToUnwrapped;

  // ---------------------------------------------------------------------------
  // 1. Setup three.js scene, load GLB core + piece-shell at real-world scale.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    let disposed = false;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Placeholder camera — the XR camera overrides it during the session.
    const camera = new THREE.PerspectiveCamera(
      60,
      Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1),
      0.01,
      100
    );
    camera.position.set(0, 1.4, 0.6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Enabled when the immersive session starts.
    renderer.xr.enabled = false;
    rendererRef.current = renderer;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xfff2e0, 1.1));
    scene.add(new THREE.HemisphereLight(0xfff5e6, 0x2a140a, 0.6));
    // IBL so metalness-heavy GLB foil never renders black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const sun = new THREE.DirectionalLight(0xfff5e6, 2.0);
    sun.position.set(0.6, 1.6, 0.4);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd4af37, 0.7);
    fill.position.set(-0.6, 0.8, -0.5);
    scene.add(fill);

    // Reticle ring that follows the live hit-test surface.
    const reticleGeo = new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2);
    const reticle = new THREE.Mesh(
      reticleGeo,
      new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.9 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Model root (positioned by placement; yaw is user-controlled).
    const modelRoot = new THREE.Group();
    modelRoot.visible = false;
    scene.add(modelRoot);
    modelRootRef.current = modelRoot;

    // Assembly lifts content so the bar's bottom rests on the surface (y=0).
    const assembly = new THREE.Group();
    modelRoot.add(assembly);
    assemblyRef.current = assembly;

    // Core slides along X inside the sleeve as pieces tear away.
    const coreGroup = new THREE.Group();
    assembly.add(coreGroup);
    coreGroupRef.current = coreGroup;

    const shellGroup = new THREE.Group();
    assembly.add(shellGroup);
    shellGroupRef.current = shellGroup;

    const wrapperTex = createWrapperTexture(product, factory);
    // AR world units are meters — scale tear physics to the real bar size.
    physScaleRef.current = Math.max(dims.length / 3.2, 0.02);

    const setupShell = (localSize: THREE.Vector3) => {
      if (disposed) return;
      // Single clamp, owned here: assembly scale is set (not multiplied),
      // so load and unwrap-swap converge to the same world size.
      const world = applyRealWorldClamp(assembly, localSize);
      placedSizeRef.current.copy(world);
      if (assembly) {
        lockedScaleRef.current.copy(assembly.scale);
        lockedScaleReadyRef.current = true;
      }
      // Sleeve is built in assembly-LOCAL units; the world size only drives
      // lift (y) and slide distance.
      const shellDims: ShellDims = { width: localSize.x, height: localSize.y, depth: localSize.z };
      const pieces = buildWrapperShell(shellGroup, shellDims, wrapperTex);
      piecesRef.current = pieces;
      coreReadyRef.current = true;
      slideDistanceRef.current = world.x * 0.75;
      // Base rests exactly on the placement plane (y=0) — never floating.
      assembly.position.y = world.y / 2;
      setIsCoreLoading(false);

      const initP = Math.min(Math.max(initProgressRef.current, 0), 1);
      if (initP > 0 && pieces.length > 0) {
        const capped = initP >= 1 ? pieces.length : Math.floor(initP * pieces.length);
        for (let i = 0; i < capped; i++) {
          launchPiece(pieces[i], physScaleRef.current);
          pieces[i].opacity = 0;
          pieces[i].mesh.visible = false;
        }
        progressRef.current = capped / pieces.length;
        setProgress(progressRef.current);
        if (capped >= pieces.length) {
          fullyUnwrappedRef.current = true;
          setFullyUnwrapped(true);
        }
      }
    };

    // Load the WRAPPED GLB core (foil modeled) under the tearable sleeve.
    // The real unwrapped bar (glbUnwrapped) swaps in once progress hits 1.
    loadGltfCached(paths.glb)
      .then((gltf) => {
        if (disposed) return;
        // Real-world scale: longest side of the bbox == product's longest dimension (meters).
        // Normalized under identity, then attached — the assembly owns scale from here on.
        const { clone, localSize } = prepareNormalizedCore(gltf.scene, dims.length);
        coreGroup.add(clone);
        setupShell(localSize);
        // Resumed with full progress (e.g. returning from the 3D view):
        // show the REAL unwrapped bar, not the wrapped core.
        if (fullyUnwrappedRef.current) {
          void swapArCoreToUnwrappedRef.current();
        }
      })
      .catch((err) => {
        if (disposed) return;
        console.debug('AR GLB load failed:', err);
        setErrorMessage('No se pudo cargar el modelo de la tableta.');
        setIsCoreLoading(false);
      });

    const handleResize = () => {
      if (!renderer || !camera) return;
      const w = Math.max(host.clientWidth, 1);
      const h = Math.max(host.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Pre-session idle render is unnecessary (landing UI covers the canvas),
    // but keep physics warm for when the session starts — loop starts w/ session.

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      wrapperTex.dispose();
      piecesRef.current = [];
      const session = xrSessionRef.current;
      if (session) {
        session.end().catch(() => undefined);
        xrSessionRef.current = null;
      }
      renderer.setAnimationLoop(null);
      renderer.xr.enabled = false;
      if (renderer.domElement && host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
      if (scene.environment) {
        (scene.environment as THREE.Texture).dispose();
        scene.environment = null;
      }
      renderer.dispose();
      sceneRef.current = null;
      modelRootRef.current = null;
      assemblyRef.current = null;
      coreGroupRef.current = null;
      shellGroupRef.current = null;
      reticleRef.current = null;
      rendererRef.current = null;
    };
    // Effect intentionally keyed on product identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, factory]);

  // ---------------------------------------------------------------------------
  // 2. Feature detection: navigator.xr + immersive-ar support.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const xr = (navigator as Navigator).xr;
    if (!xr) {
      setSupport('unsupported');
      return;
    }
    xr.isSessionSupported('immersive-ar')
      .then((ok) => {
        if (!cancelled) setSupport(ok ? 'supported' : 'unsupported');
      })
      .catch(() => {
        if (!cancelled) setSupport('unsupported');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 3. Tear/orbit gesture handling on the DOM-overlay gesture layer.
  // ---------------------------------------------------------------------------
  const stopLongPressLoop = () => {
    if (pressRafRef.current !== null) {
      cancelAnimationFrame(pressRafRef.current);
      pressRafRef.current = null;
    }
    setLongPressPct(0);
  };

  const raycastFromScreen = useCallback(
    (clientX: number, clientY: number): THREE.Intersection[] => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const host = canvasHostRef.current;
      if (!renderer || !scene || !camera || !host) return [];

      // During XR the overlay covers the full viewport — use overlay bounds.
      const rect = (overlayRef.current ?? host).getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      // The camera's matrices are updated by WebXR each frame — setFromCamera works.
      raycaster.setFromCamera(ndc, camera);
      const shell = shellGroupRef.current;
      if (!shell) return [];
      return raycaster.intersectObjects(shell.children, false);
    },
    []
  );

  const tearAt = useCallback(
    (clientX: number, clientY: number, segLen: number) => {
      if (!coreReadyRef.current || fullyUnwrappedRef.current) return;
      if (gestureTornRef.current >= MAX_TEAR_PER_GESTURE) return;
      const pieces = piecesRef.current;
      if (pieces.length === 0) return;

      const hits = raycastFromScreen(clientX, clientY);
      for (const hit of hits) {
        const piece = pieces.find((p) => p.mesh === hit.object);
        if (!piece || piece.torn) continue;

        piece.pathAccum += segLen;
        if (!piece.dented && piece.pathAccum >= DENT_PATH_PX) {
          piece.dented = true;
          piece.mesh.position.z += 0.004; // tiny dent at AR scale
        }
        if (piece.pathAccum >= TEAR_PATH_PX && gestureTornRef.current < MAX_TEAR_PER_GESTURE) {
          gestureTornRef.current++;
          launchPiece(piece, physScaleRef.current);
          const now = performance.now();
          if (now - lastSoundAtRef.current > TEAR_SOUND_THROTTLE) {
            lastSoundAtRef.current = now;
            playFoilTearSound();
          }
          applyProgress(pieces.filter((p) => p.torn).length, pieces.length);
        }
        break;
      }
    },
    [applyProgress, raycastFromScreen]
  );

  const hitModel = useCallback(
    (clientX: number, clientY: number): boolean => {
      const model = modelRootRef.current;
      if (!model || !model.visible) return false;
      const hits = raycastFromScreen(clientX, clientY);
      if (hits.length > 0) return true;
      // Also test the core meshes directly (shell may be mostly torn).
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const overlay = overlayRef.current;
      if (!renderer || !camera || !overlay) return false;
      const rect = overlay.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(model, true).length > 0;
    },
    [raycastFromScreen]
  );

  useEffect(() => {
    const layer = gestureLayerRef.current;
    if (!layer) return;

    const g = gestureRef.current;

    const tickPress = () => {
      if (!g.active || g.longPressFired) return;
      const elapsed = performance.now() - g.pressStartedAt;
      const pct = Math.min(1, elapsed / LONG_PRESS_MS);
      setLongPressPct(pct);
      if (pct >= 1 && !g.longPressFired && !g.moved && isPlacedRef.current) {
        g.longPressFired = true;
        movingRef.current = true;
        setMoving(true);
        stopLongPressLoop();
      } else {
        pressRafRef.current = requestAnimationFrame(tickPress);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!sessionActive) return;
      try {
        layer.setPointerCapture(e.pointerId);
      } catch {
        // Best-effort capture.
      }
      g.active = true;
      g.pointerId = e.pointerId;
      g.startX = g.lastX = e.clientX;
      g.startY = g.lastY = e.clientY;
      g.pressStartedAt = performance.now();
      g.moved = false;
      g.longPressFired = false;
      gestureTornRef.current = 0;
      piecesRef.current.forEach((p) => {
        if (!p.torn) p.pathAccum = 0;
      });

      if (isPlacedRef.current && hitModel(e.clientX, e.clientY)) {
        pressRafRef.current = requestAnimationFrame(tickPress);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!g.active || !sessionActive) return;

      const totalDx = e.clientX - g.startX;
      const totalDy = e.clientY - g.startY;
      const dist = Math.hypot(totalDx, totalDy);
      if (dist > LONG_PRESS_SLOP_PX) {
        g.moved = true;
        if (!g.longPressFired) stopLongPressLoop();
      }

      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      const segLen = Math.hypot(dx, dy);

      if (movingRef.current) {
        // Model follows live hit-test in the XR loop; nothing to do here.
        g.lastX = e.clientX;
        g.lastY = e.clientY;
        return;
      }

      if (!isPlacedRef.current || segLen < 0.5) {
        g.lastX = e.clientX;
        g.lastY = e.clientY;
        return;
      }

      if (fullyUnwrappedRef.current) {
        // Rotate 360° — single-finger horizontal drag.
        userYawRef.current += dx * 0.01;
        const model = modelRootRef.current;
        if (model) model.rotation.y = userYawRef.current;
      } else {
        // Same piece-by-piece tear interaction as the 3D unwrap view.
        const midX = g.lastX + dx * 0.5;
        const midY = g.lastY + dy * 0.5;
        tearAt(midX, midY, segLen * 0.5);
        tearAt(e.clientX, e.clientY, segLen * 0.5);
      }

      g.lastX = e.clientX;
      g.lastY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!g.active) return;
      g.active = false;
      stopLongPressLoop();
      if (movingRef.current) {
        // Release while moving = place at the current reticle position.
        movingRef.current = false;
        setMoving(false);
        isPlacedRef.current = true;
        setPlaced(true);
      }
      try {
        if (layer.hasPointerCapture(e.pointerId)) {
          layer.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore.
      }
    };

    layer.addEventListener('pointerdown', onPointerDown);
    layer.addEventListener('pointermove', onPointerMove);
    layer.addEventListener('pointerup', onPointerUp);
    layer.addEventListener('pointercancel', onPointerUp);

    return () => {
      layer.removeEventListener('pointerdown', onPointerDown);
      layer.removeEventListener('pointermove', onPointerMove);
      layer.removeEventListener('pointerup', onPointerUp);
      layer.removeEventListener('pointercancel', onPointerUp);
      stopLongPressLoop();
    };
  }, [sessionActive, hitModel, tearAt]);

  // ---------------------------------------------------------------------------
  // 4. WebXR session lifecycle (hit-test, placement, animation loop).
  // ---------------------------------------------------------------------------
  const endSession = useCallback(() => {
    const session = xrSessionRef.current;
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.setAnimationLoop(null);
      renderer.xr.enabled = false;
    }
    if (session) {
      xrSessionRef.current = null;
      session.end().catch(() => undefined);
    }
    hitTestSourceRef.current = null;
    isPlacedRef.current = false;
    movingRef.current = false;
    hasHitRef.current = false;
    autoPlacedRef.current = false;
    anchorRef.current = null;
    frameRef.current = null;
    setSessionActive(false);
    setPlaced(false);
    setMoving(false);
    setLongPressPct(0);
    const reticle = reticleRef.current;
    if (reticle) reticle.visible = false;
    const model = modelRootRef.current;
    if (model) model.visible = false;
  }, []);

  const startSession = useCallback(async () => {
    const xr = (navigator as Navigator).xr;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (!xr || !renderer || !scene || !overlay) {
      setErrorMessage('Tu navegador no compatible con RA inmersiva.');
      return;
    }

    setStarting(true);
    setErrorMessage(null);
    try {
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'anchors'],
        domOverlay: { root: overlay }
      });

      xrSessionRef.current = session;
      renderer.xr.enabled = true;
      // Floor-aligned space when available so the bar rests at true height,
      // plain 'local' otherwise (steady enough for a tabletop bar).
      try {
        renderer.xr.setReferenceSpaceType('local-floor');
        await renderer.xr.setSession(session);
      } catch {
        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(session);
      }
      sessionT0Ref.current = performance.now();
      autoPlacedRef.current = false;
      anchorRef.current = null;

      // Hit-test source from the viewer's space (camera direction).
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const source = await session.requestHitTestSource({ space: viewerSpace });
      hitTestSourceRef.current = source ?? null;

      const controller = renderer.xr.getController(0);
      /** Best-effort anchor so the bar sticks to the real surface. */
      const tryCreateAnchor = async () => {
        try {
          const frame = frameRef.current;
          const refSpace = renderer.xr.getReferenceSpace();
          const createAnchor = (frame as unknown as { createAnchor?: unknown })
            .createAnchor;
          if (!frame || !refSpace || typeof createAnchor !== 'function') return;
          const pos = lastHitPosRef.current;
          const anchor = await (
            createAnchor as (
              pose: XRRigidTransform,
              space: XRReferenceSpace
            ) => Promise<unknown>
          ).call(
            frame,
            new XRRigidTransform(
              { x: pos.x, y: pos.y, z: pos.z },
              { x: 0, y: 0, z: 0, w: 1 }
            ),
            refSpace
          );
          anchorRef.current = anchor ?? null;
        } catch {
          // Anchors are optional — hit-test + reticle remain the fallback.
          anchorRef.current = null;
        }
      };
      const onSelect = () => {
        // First tap confirms the placement: the live hit-test wins,
        // otherwise the auto-placed preview in front of the camera is kept.
        // Preview and placed are the SAME object — after isPlaced=true the
        // position freezes (no more hit-follow; anchor-follow below ignores
        // jumps >= 0.25m). Only position + yaw are ever copied.
        if (!isPlacedRef.current && !movingRef.current) {
          const model = modelRootRef.current;
          if (model && (hasHitRef.current || autoPlacedRef.current)) {
            if (hasHitRef.current) {
              // Root sits ON the surface point; the assembly lifts the bar
              // so its base touches the plane instead of floating.
              model.position.copy(lastHitPosRef.current);
            }
            model.rotation.y = userYawRef.current;
            model.visible = true;
            // Locked scale: never inherit scale from a hit/anchor matrix.
            const assembly = assemblyRef.current;
            if (assembly && lockedScaleReadyRef.current) {
              assembly.scale.copy(lockedScaleRef.current);
            }
            // Min/max camera distance so a 15-20cm hit doesn't fill the
            // screen (looks giant) and a far hit doesn't park the bar behind.
            // Keeps the support y (no floating).
            const cam = cameraRef.current;
            let dist = -1;
            if (cam) {
              dist = cam.position.distanceTo(model.position);
              const dir = new THREE.Vector3();
              if (dist < 0.45) {
                cam.getWorldDirection(dir);
                dir.y = 0;
                if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
                dir.normalize();
                const target = cam.position.clone().add(dir.multiplyScalar(0.55));
                target.y = model.position.y;
                model.position.copy(target);
                dist = cam.position.distanceTo(model.position);
              } else if (dist > 4) {
                cam.getWorldDirection(dir);
                const target = cam.position.clone().add(dir.multiplyScalar(1.2));
                target.y = model.position.y;
                model.position.copy(target);
                dist = cam.position.distanceTo(model.position);
              }
            }
            isPlacedRef.current = true;
            setPlaced(true);
            const reticle = reticleRef.current;
            if (reticle) reticle.visible = false;
            void tryCreateAnchor();
            // TEMP-AR-SCALE-LOG: remote verification for the person-size bug.
            console.log('[AR] placed size', placedSizeRef.current.toArray(), 'scale', assemblyRef.current?.scale.toArray(), 'dist', dist);
          }
        }
      };
      controller.addEventListener('select', onSelect);

      session.addEventListener('end', () => {
        controller.removeEventListener('select', onSelect);
        renderer.setAnimationLoop(null);
        renderer.xr.enabled = false;
        hitTestSourceRef.current = null;
        xrSessionRef.current = null;
        isPlacedRef.current = false;
        movingRef.current = false;
        hasHitRef.current = false;
        autoPlacedRef.current = false;
        anchorRef.current = null;
        frameRef.current = null;
        setSessionActive(false);
        setPlaced(false);
        setMoving(false);
        setLongPressPct(0);
        const reticle = reticleRef.current;
        if (reticle) reticle.visible = false;
      });

      // XR loop — must use renderer.setAnimationLoop (NOT requestAnimationFrame).
      const reticle = reticleRef.current;
      const model = modelRootRef.current;
      const clock = new THREE.Clock();

      renderer.setAnimationLoop((_time, frame) => {
        const dt = clock.getDelta();

        if (frame) {
          frameRef.current = frame;
          const refSpace = renderer.xr.getReferenceSpace();
          const hitSource = hitTestSourceRef.current;
          if (refSpace && hitSource) {
            const results = frame.getHitTestResults(hitSource);
            if (results.length > 0) {
              const pose = results[0].getPose(refSpace);
              if (pose) {
                const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
                const pos = new THREE.Vector3().setFromMatrixPosition(m);
                lastHitPosRef.current.copy(pos);
                hasHitRef.current = true;
                if (reticle) {
                  reticle.visible = !isPlacedRef.current || movingRef.current;
                  reticle.matrix.copy(m);
                  reticle.matrixWorldNeedsUpdate = true;
                }
                // Placement stickiness: only follow the surface while moving
                // (or before the first placement).
                if (model && (!isPlacedRef.current || movingRef.current)) {
                  model.position.copy(pos);
                  // Hidden until first tap — unless the auto-place preview
                  // is already showing in front of the camera.
                  if (!isPlacedRef.current) model.visible = autoPlacedRef.current;
                  else model.visible = true;
                }
              }
            } else if (!isPlacedRef.current && reticle) {
              reticle.visible = false;
            }
          }

          // Auto-place fallback: no tap within 1s of the session → preview
          // the bar 0.9 m in front of the camera; tap/select confirms it.
          // Kept opaque on purpose: the clone shares materials with the GLB
          // cache, so a transparency preview would leak into other views.
          if (
            model &&
            coreReadyRef.current &&
            !isPlacedRef.current &&
            !autoPlacedRef.current &&
            performance.now() - sessionT0Ref.current > 1000
          ) {
            autoPlacedRef.current = true;
            const cam = cameraRef.current;
            if (cam) {
              const dir = new THREE.Vector3();
              cam.getWorldDirection(dir);
              const target = cam.position.clone().add(dir.multiplyScalar(0.9));
              const surfaceY = hasHitRef.current
                ? lastHitPosRef.current.y
                : target.y - 0.15;
              target.y = Math.max(target.y - 0.15, surfaceY);
              model.position.copy(target);
              model.rotation.y = userYawRef.current;
              model.visible = true;
            }
          }

          // Anchor follow (frozen once placed): only accept small corrections
          // (<0.25m/frame). Bigger jumps are drift/re-localization, not real
          // movement — ignoring them keeps the preview == placed object.
          // Never copies scale/quaternion: position only, yaw stays manual.
          if (model && anchorRef.current && isPlacedRef.current && !movingRef.current) {
            try {
              const refSpace = renderer.xr.getReferenceSpace();
              const anchorSpace = (
                anchorRef.current as unknown as { anchorSpace?: XRReferenceSpace }
              ).anchorSpace;
              const anchorPose =
                refSpace && anchorSpace
                  ? frame.getPose(anchorSpace, refSpace)
                  : null;
              if (anchorPose) {
                const ap = anchorPose.transform.position;
                const jump = Math.hypot(
                  ap.x - model.position.x,
                  ap.y - model.position.y,
                  ap.z - model.position.z
                );
                if (jump < 0.25) {
                  model.position.set(ap.x, ap.y, ap.z);
                }
              }
            } catch {
              // Keep the last known position on anchor errors.
            }
          }

          // Post-placement stabilization, every frame: locked scale wins and
          // the bar is kept in a readable range (0.55m if too close, 1.2m
          // if a far hit parked it behind). Keeps support y.
          if (model && isPlacedRef.current && !movingRef.current) {
            const assembly = assemblyRef.current;
            if (assembly && lockedScaleReadyRef.current) {
              assembly.scale.copy(lockedScaleRef.current);
            }
            const cam = cameraRef.current;
            if (cam && model.visible) {
              const dist = cam.position.distanceTo(model.position);
              if (dist < 0.45) {
                const fwd = new THREE.Vector3();
                cam.getWorldDirection(fwd);
                fwd.y = 0;
                if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
                fwd.normalize();
                const target = cam.position.clone().add(fwd.multiplyScalar(0.55));
                target.y = model.position.y;
                model.position.copy(target);
              } else if (dist > 4) {
                const fwd = new THREE.Vector3();
                cam.getWorldDirection(fwd);
                const target = cam.position.clone().add(fwd.multiplyScalar(1.2));
                target.y = model.position.y;
                model.position.copy(target);
              }
            }
          }
        }

        // Wrapper physics + core slide ("a medio sacar") + idle spin when bare.
        // AR gravity stays at 0.001 (foil pieces are meter-scale) — do not raise it.
        updatePiecePhysics(piecesRef.current, 0.001);
        const core = coreGroupRef.current;
        if (core && coreReadyRef.current) {
          const targetSlide = fullyUnwrappedRef.current
            ? 0
            : smoothstep(0.3, 0.9, progressRef.current) * slideDistanceRef.current;
          core.position.x += (targetSlide - core.position.x) * 0.1;
        }
        if (
          model &&
          model.visible &&
          fullyUnwrappedRef.current &&
          !movingRef.current &&
          !gestureRef.current.active
        ) {
          userYawRef.current += dt * 0.25;
          model.rotation.y = userYawRef.current;
        }

        renderer.render(scene, cameraRef.current!);
      });

      setSessionActive(true);
    } catch (err) {
      console.debug('Failed to start AR session:', err);
      setErrorMessage('No se pudo iniciar la sesión de RA. Inténtalo de nuevo.');
    } finally {
      setStarting(false);
    }
  }, []);

  // Close session on unmount safety.
  useEffect(() => {
    return () => {
      const session = xrSessionRef.current;
      if (session) session.end().catch(() => undefined);
    };
  }, []);

  // --- Derived HUD copy (Spanish, matching the rest of the app) ---
  const hintText = !placed
    ? 'Busca una superficie · Toca para colocar'
    : moving
      ? 'Mueve el dedo y suelta para recolocar'
      : fullyUnwrapped
        ? 'Arrastra para girar 360°'
        : 'Arrastra sobre la tableta para desenvolver · Mantén 1s para mover';

  const progressPct = Math.round(progress * 100);

  return (
    <div className="relative w-full h-app overflow-hidden bg-[#120a06] select-none">
      {/* Canvas host (composited into the XR view during the session) */}
      <div ref={canvasHostRef} className="absolute inset-0" />

      {/* Overlay: pre-session landing/fallback + in-session HUD (dom-overlay root). */}
      <div
        ref={overlayRef}
        className="absolute inset-0 z-40"
        style={{ touchAction: 'none' }}
      >
        {/* Full-screen gesture layer (active only while a session runs). */}
        <div ref={gestureLayerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* ---------------- Pre-session: checking ---------------- */}
        {support === 'checking' && !sessionActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#120a06]/90 p-6 text-center">
            <div className="w-10 h-10 rounded-full border-2 border-[#d4af37]/30 border-t-[#f1c40f] animate-spin" />
            <span className="text-sm text-[#e5c158]">Comprobando compatibilidad con RA...</span>
          </div>
        )}

        {/* ---------------- Pre-session: unsupported (iOS Quick Look fallback) ---------------- */}
        {support === 'unsupported' && !sessionActive && (
          <div className="absolute inset-0 overflow-y-auto flex items-center justify-center bg-[#120a06]/92 p-4">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md bg-[#1c100a]/95 border-2 border-[#d4af37]/45 rounded-2xl p-6 shadow-2xl shadow-black"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#2e1910] border border-[#d4af37]/40 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-[#f1c40f]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#fcf8f2] font-serif-luxury">
                    Ver en RA no está disponible aquí
                  </h3>
                  <p className="text-xs text-[#bda393]">{product.name}</p>
                </div>
              </div>

              <p className="text-sm text-[#d7c4b7] leading-relaxed mb-4">
                En iPhone se abre el visor de AR del sistema. Toca el enlace para
                colocar la tableta en tu espacio con detección de superficies,
                movimiento y rotación nativos.
              </p>

              {/* NOTE: Quick Look USDZ models must be authored in meters
                  (longest side ≤ 0.20 m) — they cannot be rescaled from code.
                  Do not edit the USDZ binaries; fix the source asset instead. */}
              <div className="flex flex-col gap-2.5 mb-5">
                <a
                  rel="ar"
                  href={paths.usdzUnwrapped}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-sm shadow-lg shadow-[#d4af37]/30 active:scale-[0.98] transition-all"
                >
                  <Scan className="w-4 h-4" />
                  <span>Abrir tableta desenvuelta en RA</span>
                </a>
                <a
                  rel="ar"
                  href={paths.usdz}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2e1910] text-[#e5c158] font-bold text-sm border border-[#d4af37]/35 active:scale-[0.98] transition-all"
                >
                  <span>Abrir tableta envuelta en RA</span>
                </a>
              </div>

              <button
                onClick={onBack}
                className="w-full py-3 rounded-xl bg-[#2b170e] hover:bg-[#3d2215] text-[#e5c158] font-bold text-sm border border-[#d4af37]/30 transition-all cursor-pointer"
              >
                Continuar en 3D
              </button>
            </motion.div>
          </div>
        )}

        {/* ---------------- Pre-session: supported — start panel ---------------- */}
        {support === 'supported' && !sessionActive && (
          <div className="absolute inset-0 overflow-y-auto flex items-center justify-center bg-[#120a06]/90 p-4">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md bg-[#1c100a]/95 border-2 border-[#d4af37]/45 rounded-2xl p-6 shadow-2xl shadow-black"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#2e1910] border border-[#d4af37]/40 flex items-center justify-center flex-shrink-0">
                    <Scan className="w-5 h-5 text-[#f1c40f]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-[#fcf8f2] font-serif-luxury truncate">
                      Ver en RA
                    </h3>
                    <p className="text-xs text-[#bda393] truncate">{product.name}</p>
                  </div>
                </div>
                <button
                  onClick={onBack}
                  className="w-8 h-8 rounded-xl bg-[#2b170e] hover:bg-[#3d2215] border border-[#d4af37]/30 flex items-center justify-center text-[#e5c158] transition-colors cursor-pointer flex-shrink-0"
                  title="Cerrar y volver"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ul className="space-y-2 mb-5 text-sm text-[#d7c4b7]">
                <li className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#2e1910] border border-[#d4af37]/30 flex items-center justify-center text-[11px] font-bold text-[#f1c40f]">1</span>
                  <span>Busca una superficie</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#2e1910] border border-[#d4af37]/30 flex items-center justify-center text-[11px] font-bold text-[#f1c40f]">2</span>
                  <span>Toca para colocar la tableta</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#2e1910] border border-[#d4af37]/30 flex items-center justify-center text-[11px] font-bold text-[#f1c40f]">3</span>
                  <span>Mantén 1s presionado para moverla</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#2e1910] border border-[#d4af37]/30 flex items-center justify-center text-[11px] font-bold text-[#f1c40f]">4</span>
                  <span>Arrastra para girar o desenvolver</span>
                </li>
              </ul>

              {errorMessage && (
                <p className="text-xs text-[#f87171] mb-3">{errorMessage}</p>
              )}

              <button
                onClick={startSession}
                disabled={starting || isCoreLoading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#d4af37]/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {starting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-[#1a0f08]/30 border-t-[#1a0f08] animate-spin" />
                    <span>Iniciando...</span>
                  </>
                ) : isCoreLoading ? (
                  <span>Cargando tableta...</span>
                ) : (
                  <>
                    <Scan className="w-4 h-4" />
                    <span>Iniciar AR</span>
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}

        {/* ---------------- In-session HUD ---------------- */}
        <AnimatePresence>
          {sessionActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
            >
              {/* Top bar: close + product */}
              <div className="absolute top-0 left-0 right-0 pt-14 px-4 flex items-start justify-between gap-3">
                <div className="px-3 py-1.5 rounded-full bg-[#1c100a]/85 border border-[#d4af37]/40 backdrop-blur-md max-w-[65%]">
                  <span className="text-xs font-bold text-[#e5c158] truncate block">
                    {product.name}
                  </span>
                  <span className="text-[10px] text-[#bda393] truncate block">
                    {factory.name}
                  </span>
                </div>

                <button
                  onClick={() => {
                    endSession();
                    onBack();
                  }}
                  className="pointer-events-auto w-10 h-10 rounded-xl bg-[#1c100a]/90 hover:bg-[#2b170e] border border-[#d4af37]/40 flex items-center justify-center text-[#e5c158] transition-colors cursor-pointer shadow-lg"
                  title="Salir de RA y volver"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Long-press progress ring */}
              {longPressPct > 0 && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="rgba(212,175,55,0.25)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="#f1c40f"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 15}
                      strokeDashoffset={2 * Math.PI * 15 * (1 - longPressPct)}
                    />
                  </svg>
                </div>
              )}

              {/* Bottom instructions + progress */}
              <div className="absolute bottom-0 left-0 right-0 pb-10 px-4 flex flex-col items-center gap-2">
                {progress > 0 && progress < 1 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c100a]/90 border border-[#d4af37]/40 text-[11px] text-[#f1c40f] backdrop-blur-md">
                    <span className="font-semibold">Desenvolviendo: {progressPct}%</span>
                  </div>
                )}
                {fullyUnwrapped && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c100a]/90 border border-[#22c55e]/40 text-[11px] text-[#4ade80] backdrop-blur-md">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="font-semibold">¡Tableta desnuda! Arrastra para girar</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1c100a]/85 border border-[#d4af37]/30 text-[11px] text-[#e6d5c3] backdrop-blur-md">
                    <Hand className="w-3.5 h-3.5 text-[#d4af37]" />
                    {hintText}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-[#8a7265]">
                  <span className="flex items-center gap-1">
                    <Move3d className="w-3 h-3" />
                    Mantén 1s para mover
                  </span>
                  <span className="flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    Arrastra para girar
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                  <div className="px-5 py-4 rounded-xl bg-[#1c100a]/95 border border-[#f87171]/50 text-sm text-[#fca5a5] max-w-xs text-center">
                    {errorMessage}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
