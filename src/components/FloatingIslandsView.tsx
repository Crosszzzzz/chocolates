import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ChocolateFactory } from '../types/chocolate';
import { useTheme } from '../contexts/ThemeContext';
import { SucursalesModal } from './SucursalesModal';

interface FloatingIslandsViewProps {
  factories: ChocolateFactory[];
  onSelectFactory: (factory: ChocolateFactory) => void;
  isDiving: boolean;
}

const HUD_COLLAPSED_STORAGE_KEY = 'floating-islands-hud-collapsed';

export const FloatingIslandsView: React.FC<FloatingIslandsViewProps> = ({
  factories,
  onSelectFactory,
  isDiving
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parent callback mirror: App recreates its handlers on every render, so the
  // 3D scene must never depend on their identity (it would rebuild the whole
  // canvas on any navbar click). The ref always calls the latest version.
  const onSelectFactoryRef = useRef(onSelectFactory);
  onSelectFactoryRef.current = onSelectFactory;
  
  // Focused island index (default to 0: Chocolates Para Ti at the front)
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const focusedIndexRef = useRef<number>(0);
  focusedIndexRef.current = focusedIndex;

  // Collapsible HUD card state (persisted; collapsed card becomes a small FAB)
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(HUD_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // WebGL may be unavailable (blocked GPU, headless, driver crash).
  // Keep the error in state so we render a navigable fallback, never a black screen.
  const [webglError, setWebglError] = useState<string | null>(null);
  // Sucursales modal: real Para Ti branches + factory, opened from both HUD states.
  const [sucursalesOpen, setSucursalesOpen] = useState<boolean>(false);
  // Black-scene guard: a context can exist yet never produce a frame
  // (dark clear, light/fog misconfig, frozen loop) while webglError stays null.
  const framesRenderedRef = useRef<number>(0);
  useEffect(() => {
    if (webglError !== null) return;
    const watchdog = setTimeout(() => {
      if (framesRenderedRef.current === 0) {
        setWebglError('WebGL produced no frames in time');
      }
    }, 3000);
    return () => clearTimeout(watchdog);
  }, [webglError]);

  const toggleHudCollapsed = useCallback(() => {
    setIsHudCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HUD_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Storage unavailable (private mode, etc.): collapse still works in-memory
      }
      return next;
    });
  }, []);

  const [hoveredFactory, setHoveredFactory] = useState<ChocolateFactory | null>(null);
  const hoveredFactoryRef = useRef<ChocolateFactory | null>(null);

  const [activeFactory, setActiveFactory] = useState<ChocolateFactory | null>(null);
  const activeFactoryRef = useRef<ChocolateFactory | null>(null);
  activeFactoryRef.current = activeFactory;

  const isDivingRef = useRef<boolean>(isDiving);
  isDivingRef.current = isDiving;

  // References for Three.js animation and clean teardown
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const islandGroupsRef = useRef<{ [key: string]: THREE.Group }>({});

  const { theme } = useTheme();

  // Live theme handles: fog + key lights follow the global theme without
  // rebuilding the scene (populated by the setup effect, read by [theme]).
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const goldFillRef = useRef<THREE.DirectionalLight | null>(null);
  const pointLightRef = useRef<THREE.PointLight | null>(null);

  const targetCameraPos = useRef(new THREE.Vector3(0, 3.6, 8.6));
  const currentCameraPos = useRef(new THREE.Vector3(0, 3.6, 8.6));
  const targetLookAt = useRef(new THREE.Vector3(0, 1.0, 1.2));
  const currentLookAt = useRef(new THREE.Vector3(0, 1.0, 1.2));
  const mousePos = useRef({ x: 0, y: 0 });

  // Pointer drag state for tactile swiping
  const pointerState = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    dragOffset: 0,
    isDragging: false,
    pointerId: -1,
  });
  const liveDragOffsetRef = useRef<number>(0);

  // Infinite carousel: the camera stays fixed and the islands orbit.
  // rotationTarget advances one slot per navigation; the loop eases toward it.
  const carouselRot = useRef<number>(0);
  const carouselRotTarget = useRef<number>(0);

  // Navigation handlers
  const goToNextIsland = useCallback(() => {
    if (activeFactoryRef.current) return;
    carouselRotTarget.current -= (Math.PI * 2) / factories.length;
    setFocusedIndex((prev) => {
      const next = (prev + 1) % factories.length;
      return next;
    });
  }, [factories.length]);

  const goToPrevIsland = useCallback(() => {
    if (activeFactoryRef.current) return;
    carouselRotTarget.current += (Math.PI * 2) / factories.length;
    setFocusedIndex((prev) => {
      const next = (prev - 1 + factories.length) % factories.length;
      return next;
    });
  }, [factories.length]);

  const selectIslandByIndex = useCallback((index: number) => {
    if (activeFactoryRef.current) return;
    if (index >= 0 && index < factories.length) {
      const n = factories.length;
      const prev = focusedIndexRef.current;
      const forward = ((index - prev) % n + n) % n;
      if (forward === 0) return;
      // Shortest signed forward distance so dots never spin the long way
      const steps = forward > n / 2 ? forward - n : forward;
      carouselRotTarget.current -= steps * ((Math.PI * 2) / n);
      setFocusedIndex(index);
    }
  }, [factories.length]);

  // Initiate cinematic dive into the selected island
  const handleInitiateDive = useCallback((factory: ChocolateFactory) => {
    if (activeFactoryRef.current) return;
    activeFactoryRef.current = factory;
    setActiveFactory(factory);
    hoveredFactoryRef.current = null;
    setHoveredFactory(null);

    // Camera zooms deeply into the island's live carousel position
    const livePos = islandGroupsRef.current[factory.id]?.position;
    const px = livePos ? livePos.x : factory.islandPosition[0];
    const py = livePos ? livePos.y : factory.islandPosition[1];
    const pz = livePos ? livePos.z : factory.islandPosition[2];
    targetCameraPos.current.set(px * 0.92, py + 0.6, pz + 2.2);
    targetLookAt.current.set(px, py + 0.4, pz);

    // After camera travel, trigger parent selection
    setTimeout(() => {
      onSelectFactoryRef.current(factory);
    }, 1100);
  }, []);

  // Keyboard navigation support (ArrowLeft / ArrowRight / Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeFactory) return;
      if (e.key === 'ArrowRight') {
        goToNextIsland();
      } else if (e.key === 'ArrowLeft') {
        goToPrevIsland();
      } else if (e.key === 'Enter') {
        // Let focused controls (e.g. the HUD collapse toggle) handle Enter
        // natively so global dive doesn't double-fire; arrows still work everywhere.
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('button, input, textarea, select, a[href]')) return;
        const current = factories[focusedIndexRef.current];
        if (current) {
          handleInitiateDive(current);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [factories, activeFactory, goToNextIsland, goToPrevIsland, handleInitiateDive]);

  // Three.js Scene Setup & Animation Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x130905, 0.03);

    // 2. Camera Setup
    // Responsive framing: narrow portrait phones (aspect < 0.8, e.g. 360x640)
    // pull back + widen FOV so the whole island stays in frame with margin.
    // Desktop (aspect >= 0.8) keeps the original 45 / 8.6 values untouched.
    const BASE_FOV = 45;
    const NARROW_FOV = 52;
    const NARROW_DISTANCE_FACTOR = 1.5;
    const isNarrowPortrait = (): boolean => {
      const h = container.clientHeight || 1;
      return container.clientWidth / h < 0.8;
    };
    const camera = new THREE.PerspectiveCamera(
      isNarrowPortrait() ? NARROW_FOV : BASE_FOV,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    if (isNarrowPortrait()) {
      currentCameraPos.current.set(0, 3.6, 8.6 * NARROW_DISTANCE_FACTOR);
      targetCameraPos.current.set(0, 3.6, 8.6 * NARROW_DISTANCE_FACTOR);
    }
    camera.position.copy(currentCameraPos.current);
    cameraRef.current = camera;

    // 3. Renderer Setup (may throw when WebGL is unavailable: fall back to 2D UI).
    // Note: the constructor does not throw on every GPU failure mode (a lost
    // context can surface later inside the rAF loop, where ErrorBoundary can
    // never catch it), so the context is verified here and render failures
    // below also degrade to the 2D fallback instead of a black canvas.
    let renderer: THREE.WebGLRenderer | null = null;
    let handleContextLost: ((e: Event) => void) | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      if (renderer.getContext() === null) {
        throw new Error('WebGL context unavailable');
      }
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;
      container.appendChild(renderer.domElement);
      handleContextLost = (e: Event): void => {
        e.preventDefault();
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        setWebglError('WebGL context lost');
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    } catch (error) {
      if (renderer !== null) {
        if (handleContextLost !== null) {
          renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        }
        renderer.dispose();
        rendererRef.current = null;
        renderer = null;
      }
      setWebglError(error instanceof Error ? error.message : 'WebGL unavailable');
      return;
    }

    // 4. Lighting - Rich Warm Chocolate & Gold (bright enough for factories to pop)
    const ambientLight = new THREE.AmbientLight(0xffeedd, 1.05);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const mainSun = new THREE.DirectionalLight(0xffdfa9, 2.3);
    mainSun.position.set(6, 12, 8);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 1024;
    mainSun.shadow.mapSize.height = 1024;
    scene.add(mainSun);
    sunLightRef.current = mainSun;

    const goldFill = new THREE.DirectionalLight(0xd4af37, 1.25);
    goldFill.position.set(-6, -4, -6);
    scene.add(goldFill);
    goldFillRef.current = goldFill;

    const pointLight = new THREE.PointLight(0xffa500, 2.2, 22);
    pointLight.position.set(0, 2, 0);
    scene.add(pointLight);
    pointLightRef.current = pointLight;

    // Helper: Create stylized procedural floating island
    const createIsland = (factory: ChocolateFactory) => {
      const group = new THREE.Group();
      group.position.set(...factory.islandPosition);
      group.userData = { factoryId: factory.id, factory };

      // Flat hexagonal platform: grass top with darker side rim, planar base.
      // No hanging rock cone underneath.
      const grassColor =
        factory.id === 'para-ti'
          ? 0x2e6930
          : factory.id === 'chocolates-sucre'
          ? 0x357a38
          : 0x4a6b32;
      const rimColor =
        factory.id === 'para-ti'
          ? 0x204a22
          : factory.id === 'chocolates-sucre'
          ? 0x245627
          : 0x334a23;
      // 6-segment cylinder keeps the top surface at the same height as
      // before (y = 0.05 + 0.225 = 0.275) so buildings need no repositioning.
      const platformGeo = new THREE.CylinderGeometry(2.35, 2.35, 0.45, 6);
      const topMat = new THREE.MeshStandardMaterial({
        color: grassColor,
        roughness: 0.7,
        flatShading: true
      });
      const sideMat = new THREE.MeshStandardMaterial({
        color: rimColor,
        roughness: 0.8,
        flatShading: true
      });
      const topPlateau = new THREE.Mesh(platformGeo, [sideMat, topMat, sideMat]);
      topPlateau.position.y = 0.05;
      topPlateau.receiveShadow = true;
      topPlateau.userData.isFacadePlateau = true;
      group.add(topPlateau);

      // Full 3D replica of the Para Ti storefront (ported from the standalone
      // viewer in "modelos de fabrica"). Authored ~40 units wide, so it is
      // scaled down to sit on the island plateau. Real 3D from every angle.
      const buildParaTiFactoryModel = (): THREE.Group => {
        const M = {
          stucco: new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.92 }),
          stone: new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.85 }),
          glass: new THREE.MeshPhysicalMaterial({ color: 0x16324a, metalness: 0.1, roughness: 0.06, reflectivity: 1, clearcoat: 1 }),
          gold: new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.32 }),
          metal: new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.65, roughness: 0.5 }),
          rust: new THREE.MeshStandardMaterial({ color: 0x8a4a22, metalness: 0.55, roughness: 0.8 }),
          ground: new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.95 }),
          green: new THREE.MeshStandardMaterial({ color: 0x3a8f3a, roughness: 1 }),
          trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
          pot: new THREE.MeshStandardMaterial({ color: 0xb0714f, roughness: 0.9 }),
        };

        const makeSignTexture = (): THREE.CanvasTexture => {
          const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
          const g = c.getContext('2d')!;
          g.clearRect(0, 0, 1024, 512);
          const grad = g.createLinearGradient(0, 60, 0, 360);
          grad.addColorStop(0, '#ffe9ad'); grad.addColorStop(0.5, '#f6c95c'); grad.addColorStop(1, '#d99a26');
          g.fillStyle = grad; g.strokeStyle = grad; g.textAlign = 'center';
          g.shadowColor = 'rgba(255,205,100,.85)'; g.shadowBlur = 26;
          g.font = 'italic 600 64px Georgia'; g.fillText('Chocolates', 512, 120);
          g.font = 'italic 700 170px Georgia'; g.fillText('Para Ti', 512, 300);
          g.lineWidth = 16; g.beginPath(); g.moveTo(170, 360);
          g.quadraticCurveTo(512, 440, 870, 330); g.stroke();
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
        };
        const makeAdTexture = (): THREE.CanvasTexture => {
          const c = document.createElement('canvas'); c.width = 256; c.height = 340;
          const g = c.getContext('2d')!;
          g.fillStyle = '#f4c430'; g.fillRect(0, 0, 256, 340);
          g.save(); g.translate(128, 210); g.rotate(-0.3);
          g.fillStyle = '#5a2d1c'; g.fillRect(-70, -45, 140, 90);
          g.fillStyle = '#7a4a2f'; g.fillRect(-70, -45, 140, 28); g.restore();
          g.fillStyle = '#8c1f28'; g.font = 'italic 700 44px Georgia'; g.textAlign = 'center';
          g.fillText('Para Ti', 128, 80);
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
        };

        const B = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh => {
          const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
          o.position.set(x, y, z); o.rotation.y = ry; return o;
        };

        const model = new THREE.Group();

        // Corner tower bay (stone octagon) + cornice
        const bay = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 9, 8), M.stone);
        bay.rotation.y = Math.PI / 8; bay.position.y = 4.5; model.add(bay);
        const bayCornice = new THREE.Mesh(new THREE.CylinderGeometry(8.05, 8.05, 0.7, 8), M.stucco);
        bayCornice.rotation.y = Math.PI / 8; bayCornice.position.y = 9.05; model.add(bayCornice);
        // Classic wings + cornices
        model.add(B(16, 8.6, 10, M.stucco, -12, 4.3, 0), B(10, 8.6, 16, M.stucco, 0, 4.3, -12));
        model.add(B(16.8, 0.6, 10.8, M.stucco, -12, 8.9, 0), B(10.8, 0.6, 16.8, M.stucco, 0, 8.9, -12));
        // Dark glass rooftop volume + white penthouse
        model.add(B(8.5, 3.4, 8.5, M.glass, 0, 11.1, 0, Math.PI / 4));
        model.add(B(7, 3.4, 9, M.glass, 0, 11.1, -11), B(7, 2.8, 6.5, M.stucco, -13, 10.8, 0));

        // Golden sign (double-sided: the island orbits, camera is fixed)
        const signTex = makeSignTexture();
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(11, 5.5),
          new THREE.MeshStandardMaterial({ map: signTex, transparent: true, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide, emissive: new THREE.Color('#8a6216'), emissiveMap: signTex, emissiveIntensity: 0.55 })
        );
        sign.position.set(4.6, 12.1, 4.6); sign.rotation.y = Math.PI / 4; model.add(sign);

        // Corner curtain wall + side glazing
        const cw = new THREE.Group(); cw.position.set(4.95, 4.7, 4.95); cw.rotation.y = Math.PI / 4;
        cw.add(new THREE.Mesh(new THREE.PlaneGeometry(6.4, 7.4), M.glass));
        for (let i = -2; i <= 2; i++) cw.add(B(0.09, 7.4, 0.12, M.metal, i * 1.6, 0, 0.02));
        for (let j = -1; j <= 1; j++) cw.add(B(6.4, 0.09, 0.12, M.metal, 0, j * 2.4, 0.02));
        model.add(cw);
        const sideL = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.4), M.glass);
        sideL.position.set(7.06, 4.7, 0); sideL.rotation.y = Math.PI / 2; model.add(sideL);
        const sideR = sideL.clone(); sideR.position.set(0, 4.7, 7.06); sideR.rotation.y = 0; model.add(sideR);

        // Arched windows on the wings
        const archShape = new THREE.Shape();
        archShape.moveTo(-0.8, 0); archShape.lineTo(-0.8, 2.8);
        archShape.absarc(0, 2.8, 0.8, Math.PI, 0, true); archShape.lineTo(0.8, 0); archShape.closePath();
        const winG = new THREE.ExtrudeGeometry(archShape, { depth: 0.14, bevelEnabled: false });
        for (let x = -19; x <= -6; x += 2.6) {
          const w = new THREE.Mesh(winG, M.glass); w.position.set(x, 3.4, 5.02); model.add(w);
          const w2 = w.clone(); w2.rotation.y = Math.PI / 2; w2.position.set(5.02, 3.4, x); model.add(w2);
          model.add(B(1.5, 2, 0.14, M.glass, x, 1.3, 5.02), B(0.14, 2, 1.5, M.glass, 5.02, 1.3, x));
        }

        // Entrance steps, ad panels, planters, trees
        model.add(B(7, 0.3, 2.6, M.stone, 6.5, 0.5, 6.5, Math.PI / 4));
        const adM = new THREE.MeshStandardMaterial({ map: makeAdTexture(), roughness: 0.7, side: THREE.DoubleSide });
        [[4.2, 7.6], [7.6, 4.2]].forEach((p) => {
          const ad = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), adM);
          ad.position.set(p[0], 2.1, p[1]); ad.rotation.y = Math.PI / 4; model.add(ad);
        });
        const makePot = (x: number, z: number): THREE.Group => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 12), M.pot));
          const pl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), M.green); pl.position.y = 0.85; g.add(pl);
          g.position.set(x, 0.6, z); return g;
        };
        model.add(makePot(3.2, 8.6), makePot(8.6, 3.2));
        const makeTree = (x: number, z: number, s = 1): THREE.Group => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.4, 10), M.trunk));
          for (let i = 0; i < 3; i++) {
            const c = new THREE.Mesh(new THREE.SphereGeometry(1.5 - i * 0.25, 14, 12), M.green);
            c.position.set((i - 1) * 0.7, 2.6 + i * 0.5, (i % 2) ? 0.6 : -0.6); c.scale.y = 0.8; g.add(c);
          }
          g.position.set(x, 0, z); g.scale.setScalar(s); return g;
        };
        model.add(makeTree(-17, 13, 1.2), makeTree(13, -17, 1.2));

        // Perimeter platform, railing fences and open gates (full structure)
        const platShape = new THREE.Shape();
        [[-27, 11], [3, 11], [11, 3], [11, -27], [-27, -27]].forEach((p, idx) =>
          idx ? platShape.lineTo(p[0], p[1]) : platShape.moveTo(p[0], p[1]));
        platShape.closePath();
        const plat = new THREE.Mesh(
          new THREE.ExtrudeGeometry(platShape, { depth: 0.35, bevelEnabled: false }),
          M.ground
        );
        plat.rotation.x = Math.PI / 2; plat.position.y = 0.35; plat.receiveShadow = true; model.add(plat);

        const fenceRun = (ax: number, az: number, bx: number, bz: number): THREE.Group => {
          const g = new THREE.Group();
          const dx = ax - bx, dz = az - bz, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
          g.add(B(len, 0.5, 0.35, M.stone, (ax + bx) / 2, 0.6, (az + bz) / 2, ry));
          const n = Math.max(2, Math.floor(len / 0.3));
          const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), M.metal, n);
          const dummy = new THREE.Object3D();
          for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            dummy.position.set(ax + (bx - ax) * t, 1.7, az + (bz - az) * t);
            dummy.updateMatrix(); bars.setMatrixAt(i, dummy.matrix);
          }
          g.add(bars);
          g.add(B(len, 0.09, 0.09, M.metal, (ax + bx) / 2, 2.55, (az + bz) / 2, ry));
          g.add(B(len, 0.09, 0.09, M.metal, (ax + bx) / 2, 1.5, (az + bz) / 2, ry));
          for (let t = 0; t <= 1.001; t += 0.25) {
            const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
            g.add(B(0.16, 2.1, 0.16, ((px + pz) % 2) ? M.rust : M.metal, px, 1.4, pz, ry));
          }
          return g;
        };
        model.add(fenceRun(-26, 9, -3, 9), fenceRun(9, -3, 9, -26),
          fenceRun(-26, 9, -26, -26), fenceRun(-26, -26, 9, -26));
        model.add(B(3.4, 1.9, 0.12, M.metal, -2.15, 1.3, 7.53, 1.047));
        model.add(B(3.4, 1.9, 0.12, M.metal, 7.53, 1.3, -3.85, 2.618));

        model.traverse((o) => {
          if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
        });

        // Recenter the ~40-unit authoring composition on its own middle, yaw
        // the storefront to the fixed camera, then shrink to the island.
        // (Yawing about the authoring origin instead left it parked sideways.)
        const inner = new THREE.Group();
        inner.add(model);
        inner.position.set(8, 0, 8);
        const wrapper = new THREE.Group();
        wrapper.add(inner);
        wrapper.scale.setScalar(0.09);
        wrapper.rotation.y = -Math.PI / 4;
        wrapper.position.set(0, 0.27, 0);
        return wrapper;
      };

      // Colonial replica of the Sucre factory (ported from the standalone
      // viewer in "modelos de fabrica"). Front faces +z, so no yaw needed.
      const buildSucreFactoryModel = (): THREE.Group => {
        const PIEDRA = '#b8a888';
        const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number): THREE.Mesh => {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
          );
          m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
        };
        const archHole = (w: number, h: number): THREE.Shape => {
          const s = new THREE.Shape();
          s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h);
          s.absarc(0, h, w / 2, Math.PI, 0, true);
          s.lineTo(w / 2, 0); s.closePath(); return s;
        };
        const makeSignTexture = (): THREE.CanvasTexture => {
          const c = document.createElement('canvas'); c.width = c.height = 1024;
          const g = c.getContext('2d')!;
          g.clearRect(0, 0, 1024, 1024);
          g.fillStyle = '#241a10';
          g.beginPath(); g.arc(512, 512, 500, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#e9c46a'; g.lineWidth = 20; g.lineCap = 'round';
          g.beginPath(); g.arc(512, 512, 460, -0.55 * Math.PI, 1.35 * Math.PI); g.stroke();
          const grad = g.createLinearGradient(0, 300, 0, 850);
          grad.addColorStop(0, '#ffedb8'); grad.addColorStop(0.55, '#f3c759'); grad.addColorStop(1, '#d99a26');
          g.fillStyle = grad; g.textAlign = 'center';
          g.shadowColor = 'rgba(255,205,100,.9)'; g.shadowBlur = 22;
          g.font = 'italic 600 100px Georgia'; g.fillText('Chocolates', 512, 400);
          g.font = 'italic 700 240px Georgia'; g.fillText('Sucre', 512, 660);
          g.font = '600 80px Georgia'; g.fillText('1 9 6 5', 512, 800);
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
        };

        const model = new THREE.Group();

        // Front plinth + central wall with arch + pediment
        model.add(box(30, 1.2, 1, '#9a8a6a', 0, 0.6, 0.5));
        const wallShape = new THREE.Shape();
        wallShape.moveTo(-4, 0); wallShape.lineTo(-4, 12); wallShape.lineTo(4, 12); wallShape.lineTo(4, 0); wallShape.closePath();
        wallShape.holes.push(archHole(3, 4));
        const wall = new THREE.Mesh(
          new THREE.ExtrudeGeometry(wallShape, { depth: 1, bevelEnabled: false }),
          new THREE.MeshStandardMaterial({ color: PIEDRA, roughness: 0.85 })
        );
        wall.castShadow = wall.receiveShadow = true; model.add(wall);
        const pedShape = new THREE.Shape();
        pedShape.moveTo(-4.5, 0); pedShape.lineTo(0, 3); pedShape.lineTo(4.5, 0); pedShape.closePath();
        const ped = new THREE.Mesh(
          new THREE.ExtrudeGeometry(pedShape, { depth: 1.2, bevelEnabled: false }),
          new THREE.MeshStandardMaterial({ color: PIEDRA, roughness: 0.85 })
        );
        ped.position.y = 12; ped.castShadow = true; model.add(ped);

        // Gate grille on the arch
        model.add(box(2, 2.5, 0.3, '#2a2520', 0, 10.2, 1.05));
        for (let i = -0.8; i <= 0.8; i += 0.4) model.add(box(0.05, 2.5, 0.05, '#1a1510', i, 10.2, 1.25));
        for (let j = 9.2; j <= 11.2; j += 0.5) model.add(box(2, 0.05, 0.05, '#1a1510', 0, j, 1.25));

        // White wings, windows, balconies
        model.add(box(11, 9, 1, '#f5f2ea', -9.5, 4.5, 0));
        model.add(box(11, 9, 1, '#f5f2ea', 9.5, 4.5, 0));
        const win = (x: number, y: number): THREE.Group => {
          const g = new THREE.Group();
          g.add(box(1.2, 2, 0.1, '#2a2015', 0, 0, 0.55));
          g.add(box(1.4, 0.1, 0.1, '#8a6a3a', 0, 1.05, 0.6));
          g.add(box(1.4, 0.1, 0.1, '#8a6a3a', 0, -1.05, 0.6));
          g.add(box(0.1, 2, 0.1, '#8a6a3a', 0.65, 0, 0.6));
          g.add(box(0.1, 2, 0.1, '#8a6a3a', -0.65, 0, 0.6));
          g.position.set(x, y, 0); return g;
        };
        [-13, -10.5, -8, -6, 6, 8, 10.5, 13].forEach((x) => { model.add(win(x, 6)); model.add(win(x, 2.5)); });
        const balc = (x: number): THREE.Group => {
          const g = new THREE.Group();
          g.add(box(2.5, 0.15, 1, '#8a6a3a', 0, 0, 1));
          g.add(box(2.5, 0.6, 0.08, '#8a6a3a', 0, 0.35, 1.5));
          g.add(box(0.08, 0.6, 1, '#8a6a3a', 1.2, 0.35, 1));
          g.add(box(0.08, 0.6, 1, '#8a6a3a', -1.2, 0.35, 1));
          for (let i = -1.1; i <= 1.1; i += 0.3) g.add(box(0.05, 0.6, 0.05, '#8a6a3a', i, 0.35, 1.45));
          g.position.set(x, 5.5, 0.5); return g;
        };
        [-11.5, -9, -6.5, 6.5, 9, 11.5].forEach((x) => model.add(balc(x)));

        // Side / back walls, portal tower body, plinths, gabled roofs
        const PROF = 9, FONDO = -4.5;
        model.add(box(0.5, 9.3, PROF, '#f5f2ea', -14.7, 4.65, FONDO));
        model.add(box(0.5, 9.3, PROF, '#f5f2ea', 14.7, 4.65, FONDO));
        model.add(box(30, 9.3, 0.5, '#f5f2ea', 0, 4.65, -9.25));
        model.add(box(8, 6.5, PROF, PIEDRA, 0, 11.75, FONDO));
        model.add(box(0.6, 1.2, PROF, '#9a8a6a', -14.7, 0.6, FONDO));
        model.add(box(0.6, 1.2, PROF, '#9a8a6a', 14.7, 0.6, FONDO));
        model.add(box(30, 1.2, 0.6, '#9a8a6a', 0, 0.6, -9.35));
        const ang = Math.atan(1.8 / 5.1);
        const rF = box(31, 0.3, 5.6, '#a05040', 0, 10.1, -1.95); rF.rotation.x = ang; model.add(rF);
        const rB = box(31, 0.3, 5.6, '#a05040', 0, 10.1, -7.05); rB.rotation.x = -ang; model.add(rB);
        model.add(box(31, 0.25, 0.5, '#8a4030', 0, 11.05, FONDO));
        model.add(box(9, 0.3, PROF, '#a05040', 0, 15.35, FONDO));
        [-2, -4.5, -7].forEach((z) => {
          [[14.45, Math.PI / 2], [-14.45, -Math.PI / 2]].forEach((s) => {
            const a = win(0, 6); a.rotation.y = s[1]; a.position.set(s[0], 6, z); model.add(a);
            const b = win(0, 2.5); b.rotation.y = s[1]; b.position.set(s[0], 2.5, z); model.add(b);
          });
        });
        [-10, -5, 5, 10].forEach((x) => {
          const a = win(x, 6); a.rotation.y = Math.PI; a.position.set(x, 6, -9.0); model.add(a);
          const b = win(x, 2.5); b.rotation.y = Math.PI; b.position.set(x, 2.5, -9.0); model.add(b);
        });

        // Entry passage, patio, round sign over the arch (double-sided for orbit views)
        model.add(box(0.3, 5, 6, PIEDRA, -1.65, 2.5, -3));
        model.add(box(0.3, 5, 6, PIEDRA, 1.65, 2.5, -3));
        model.add(box(3, 0.1, 6, '#c8b890', 0, 0.05, -3));
        model.add(box(6, 5, 0.3, '#e8d8b0', 0, 2.5, -6));
        const signTex = makeSignTexture();
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(3.5, 3.5),
          new THREE.MeshStandardMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide, emissive: new THREE.Color('#8a6216'), emissiveMap: signTex, emissiveIntensity: 0.55 })
        );
        sign.position.set(0, 7.2, 1.3);
        sign.castShadow = true; model.add(sign);

        // Recenter (front overhang to back wall), shrink to the island plateau
        const inner = new THREE.Group();
        inner.add(model);
        inner.position.set(0, 0, 3.7);
        const wrapper = new THREE.Group();
        wrapper.add(inner);
        wrapper.scale.setScalar(0.11);
        wrapper.position.set(0, 0.27, 0);
        return wrapper;
      };

      // Marble administration building of Taboada (ported from the standalone
      // viewer in "modelos de fabrica"). Front faces +z, so no yaw needed.
      const buildTaboadaFactoryModel = (): THREE.Group => {
        const marbleTexture = (): THREE.CanvasTexture => {
          const c = document.createElement('canvas'); c.width = c.height = 512;
          const g = c.getContext('2d')!;
          g.fillStyle = '#e8d5b0'; g.fillRect(0, 0, 512, 512);
          const tones = ['#efe0c2', '#e2cda4', '#f2e6cc', '#dcc49a', '#ebd9b8'];
          for (let i = 0; i < 90; i++) {
            const cx = Math.random() * 512, cy = Math.random() * 512, r = 18 + Math.random() * 55;
            g.fillStyle = tones[i % tones.length]; g.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2 + Math.random() * 0.6;
              const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
              if (k) g.lineTo(px, py); else g.moveTo(px, py);
            }
            g.closePath(); g.fill();
            g.strokeStyle = 'rgba(250,242,222,.7)'; g.lineWidth = 2; g.stroke();
          }
          for (let i = 0; i < 14; i++) {
            g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.5; g.beginPath();
            let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y);
            for (let k = 0; k < 4; k++) { x += Math.random() * 90 - 45; y += Math.random() * 90 - 45; g.lineTo(x, y); }
            g.stroke();
          }
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 4; return t;
        };
        const woodTexture = (): THREE.CanvasTexture => {
          const c = document.createElement('canvas'); c.width = c.height = 256;
          const g = c.getContext('2d')!;
          g.fillStyle = '#8a5a2a'; g.fillRect(0, 0, 256, 256);
          for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(60,35,12,.5)'; g.fillRect(x, 0, 3, 256); }
          for (let y = 0; y < 256; y += 64) { g.fillStyle = 'rgba(60,35,12,.45)'; g.fillRect(0, y, 256, 3); }
          g.strokeStyle = 'rgba(40,22,8,.6)'; g.lineWidth = 4;
          for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) g.strokeRect(i * 128 + 10, j * 64 + 8, 108, 48);
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
        };
        const makeSignTexture = (): THREE.CanvasTexture => {
          const c = document.createElement('canvas'); c.width = 1024; c.height = 440;
          const g = c.getContext('2d')!;
          g.clearRect(0, 0, 1024, 440);
          const grad = g.createLinearGradient(0, 60, 0, 300);
          grad.addColorStop(0, '#ffedb0'); grad.addColorStop(.5, '#f3c759'); grad.addColorStop(1, '#c08a1e');
          g.fillStyle = grad; g.textAlign = 'center';
          g.shadowColor = 'rgba(255,205,100,.85)'; g.shadowBlur = 20;
          g.font = 'italic 700 200px "Brush Script MT", Georgia, cursive';
          g.fillText('Taboada', 512, 230);
          g.font = '700 52px Arial'; g.fillText('FUNDADO 1948 ADMINISTRACIÓN CENTRAL', 512, 340);
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
        };

        const M = {
          marble: new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.55 }),
          cream: new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.8 }),
          gold: new THREE.MeshStandardMaterial({ color: 0xc9962e, metalness: 1, roughness: 0.32 }),
          glass: new THREE.MeshPhysicalMaterial({ color: 0x6a7a72, metalness: 0.1, roughness: 0.12, clearcoat: 1 }),
          slat: new THREE.MeshStandardMaterial({ color: 0xb8bdb6, roughness: 0.6 }),
          dark: new THREE.MeshStandardMaterial({ color: 0x3a3f3c, roughness: 0.7 }),
          wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.6 }),
          fix: new THREE.MeshStandardMaterial({ color: 0xcccccc, emissive: 0xfff2cc, emissiveIntensity: 3 }),
        };
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

        const B = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh => {
          const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
          o.position.set(x, y, z); o.rotation.y = ry; return o;
        };

        const model = new THREE.Group();
        const bld = new THREE.Group(); bld.position.y = 0.9; model.add(bld);

        // Marble blocks, recessed cream strips, gold bands
        bld.add(B(4.5, 10, 6.6, M.marble, -9.75, 5, -2.7));
        bld.add(B(12, 10, 6.6, M.marble, 0, 5, -2.7));
        bld.add(B(4.5, 10, 6.6, M.marble, 9.75, 5, -2.7));
        bld.add(B(1.5, 9.4, 6, M.cream, -6.75, 4.7, -3));
        bld.add(B(1.5, 9.4, 6, M.cream, 6.75, 4.7, -3));
        bld.add(B(1.5, 0.5, 0.14, M.gold, -6.75, 8.75, -0.02), B(1.5, 0.5, 0.14, M.gold, 6.75, 8.75, -0.02));
        [-9.75, 0, 9.75].forEach((x) => bld.add(B(x === 0 ? 12 : 4.5, 0.07, 0.03, M.slat, x, 8.6, 0.62)));

        // Louvered windows, front + sides
        const makeWindow = (w: number, h: number): THREE.Group => {
          const g = new THREE.Group();
          const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.12, h + 0.12), M.dark);
          frame.position.z = -0.02; g.add(frame);
          g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass));
          for (let i = 0; i < 5; i++) {
            g.add(B(w - 0.1, 0.05, 0.05, M.slat, 0, h / 2 - 0.28 - i * 0.16, 0.03));
            g.add(B(w - 0.1, 0.05, 0.05, M.slat, 0, -h / 2 + 0.28 + i * 0.16, 0.03));
          }
          g.add(B(0.05, h, 0.05, M.slat, 0, 0, 0.03));
          return g;
        };
        [[-9.75, 6.5], [-9.75, 2.6], [3.6, 6.5], [3.6, 2.6], [9.75, 6.5], [9.75, 2.6]].forEach((p) => {
          const w = makeWindow(3.2, 2.8); w.position.set(p[0], p[1], 0.63); bld.add(w);
        });
        [[-12, -Math.PI / 2], [12, Math.PI / 2]].forEach((s) => {
          [-1.6, -4.2].forEach((z) => [6.5, 2.6].forEach((y) => {
            const w = makeWindow(2.2, 2.4);
            w.position.set(s[0] + (s[0] > 0 ? 0.03 : -0.03), y, z);
            w.rotation.y = s[1]; bld.add(w);
          }));
        });

        // Wooden door, gold cornices, sign, light sconces
        bld.add(B(4.2, 3.6, 0.1, M.dark, -1.4, 2.2, 0.6));
        bld.add(B(4, 3.4, 0.12, M.wood, -1.4, 2.2, 0.68));
        bld.add(B(5.2, 0.28, 0.6, M.gold, -1.4, 4.2, 0.8));
        bld.add(B(5.0, 0.28, 0.6, M.gold, 9.75, 4.6, 0.8));
        const signTex = makeSignTexture();
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(7, 3),
          new THREE.MeshStandardMaterial({ map: signTex, transparent: true, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide, emissive: new THREE.Color('#8a6216'), emissiveMap: signTex, emissiveIntensity: 0.55 })
        );
        sign.position.set(-2.0, 7.0, 0.66); bld.add(sign);
        const coneGeo = new THREE.ConeGeometry(0.5, 1.6, 16, 1, true);
        const sconce = (x: number, y: number, z: number): THREE.Group => {
          const g = new THREE.Group();
          g.add(B(0.16, 0.2, 0.12, M.fix, 0, 0, 0.03));
          const up = new THREE.Mesh(coneGeo, glowMat); up.rotation.z = Math.PI; up.position.y = 0.85; g.add(up);
          const dn = new THREE.Mesh(coneGeo, glowMat); dn.position.y = -0.85; g.add(dn);
          g.position.set(x, y, z); g.renderOrder = 2; return g;
        };
        [[-6.75, 6.6, 0], [-6.75, 3.4, 0], [6.75, 6.6, 0], [6.75, 3.4, 0],
          [-11.4, 5.0, 0.62], [11.4, 5.0, 0.62], [-2.4, 4.9, 0.62], [0.2, 4.9, 0.62]]
          .forEach((p) => bld.add(sconce(p[0], p[1], p[2])));

        model.traverse((o) => {
          if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
        });

        // Recenter front-to-back, shrink to the island plateau
        const inner = new THREE.Group();
        inner.add(model);
        inner.position.set(0, 0, 2.75);
        const wrapper = new THREE.Group();
        wrapper.add(inner);
        wrapper.scale.setScalar(0.14);
        wrapper.position.set(0, 0.27, 0);
        return wrapper;
      };

      // Architectural Feature for each Factory
      if (factory.id === 'para-ti') {
        // Real 3D storefront replica on its island
        group.add(buildParaTiFactoryModel());

      } else if (factory.id === 'chocolates-sucre') {
        // Real colonial factory replica on its island
        group.add(buildSucreFactoryModel());

      } else if (factory.id === 'taboada') {
        // Real marble administration building on its island
        group.add(buildTaboadaFactoryModel());
      }

      // Hitbox cylinder for raycasting click / focus
      const hitBox = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.6, 4.8, 12),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitBox.position.y = 0.5;
      hitBox.userData = { factory };
      group.add(hitBox);

      scene.add(group);
      islandGroupsRef.current[factory.id] = group;
    };

    factories.forEach(createIsland);

    // Staggered entrance: each island flies in from the far background one
    // by one, then settles on its live carousel slot. GSAP is not installed,
    // so easing runs manually in the rAF loop. Purely visual: carousel
    // targets, raycast hover/click and dive handlers stay live throughout.
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ENTRANCE_STAGGER = 0.5;
    const ENTRANCE_DURATION = 1.1;
    const ENTRANCE_FAR_Z = -7;
    const ENTRANCE_FAR_Y = 2.5;
    const ENTRANCE_START_SCALE = 0.01;
    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    if (!prefersReducedMotion) {
      factories.forEach((factory) => {
        const island = islandGroupsRef.current[factory.id];
        if (island) {
          island.position.z += ENTRANCE_FAR_Z;
          island.position.y += ENTRANCE_FAR_Y;
          island.scale.setScalar(ENTRANCE_START_SCALE);
        }
      });
    }

    // 6. Raycasting & Drag Interaction setup
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e: PointerEvent) => {
      if (isDivingRef.current || activeFactoryRef.current) return;
      pointerState.current = {
        isDown: true,
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        dragOffset: 0,
        isDragging: false,
        pointerId: e.pointerId,
      };

      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // Fallback for browsers with strict capture rules
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mousePos.current = { x: mouse.x, y: mouse.y };

      if (pointerState.current.isDown) {
        const deltaX = e.clientX - pointerState.current.startX;
        const deltaY = e.clientY - pointerState.current.startY;

        // If moved beyond 12px threshold, engage tactile dragging
        if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) {
          pointerState.current.isDragging = true;
          pointerState.current.dragOffset = deltaX;
          liveDragOffsetRef.current = deltaX;
        }
      } else {
        // Hover raycasting when not dragging
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        let found: ChocolateFactory | null = null;
        for (const hit of intersects) {
          let currentObj: THREE.Object3D | null = hit.object;
          while (currentObj && currentObj !== scene) {
            if (currentObj.userData?.factory) {
              found = currentObj.userData.factory;
              break;
            }
            currentObj = currentObj.parent;
          }
          if (found) break;
        }

        // ONLY allow hover on the currently active/focused island in the center!
        const currentFocused = factories[focusedIndexRef.current];
        if (found && currentFocused && found.id === currentFocused.id) {
          // Valid hover on center island
        } else {
          // Background islands or empty space -> no hover
          found = null;
        }

        if (found?.id !== hoveredFactoryRef.current?.id) {
          hoveredFactoryRef.current = found;
          setHoveredFactory(found);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!pointerState.current.isDown) return;
      pointerState.current.isDown = false;

      try {
        if (container.hasPointerCapture(e.pointerId)) {
          container.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release capture errors
      }

      const deltaX = e.clientX - pointerState.current.startX;
      const duration = performance.now() - pointerState.current.startTime;
      const velocity = Math.abs(deltaX) / (duration || 1);
      const wasDragging = pointerState.current.isDragging;

      pointerState.current.isDragging = false;
      pointerState.current.dragOffset = 0;
      liveDragOffsetRef.current = 0;

      if (wasDragging && (Math.abs(deltaX) > 40 || velocity > 0.35)) {
        // Drag gesture triggered: navigate between islands
        if (deltaX < 0) {
          // Swiped left -> next island
          goToNextIsland();
        } else {
          // Swiped right -> previous island
          goToPrevIsland();
        }
      } else if (!wasDragging) {
        // Clean single click / tap: raycast for island selection
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        let clickedFactory: ChocolateFactory | null = null;
        for (const hit of intersects) {
          let currentObj: THREE.Object3D | null = hit.object;
          while (currentObj && currentObj !== scene) {
            if (currentObj.userData?.factory) {
              clickedFactory = currentObj.userData.factory;
              break;
            }
            currentObj = currentObj.parent;
          }
          if (clickedFactory) break;
        }

        if (clickedFactory) {
          const currentFocused = factories[focusedIndexRef.current];
          if (clickedFactory.id === currentFocused?.id) {
            // Clicked on the already focused island -> dive into history
            handleInitiateDive(clickedFactory);
          } else {
            // Clicked on another island -> bring it to the center focus
            const targetIdx = factories.findIndex((f) => f.id === clickedFactory!.id);
            if (targetIdx !== -1) {
              selectIslandByIndex(targetIdx);
            }
          }
        }
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      pointerState.current.isDown = false;
      pointerState.current.isDragging = false;
      liveDragOffsetRef.current = 0;
      try {
        if (container.hasPointerCapture(e.pointerId)) {
          container.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    };

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const aspect = container.clientWidth / (container.clientHeight || 1);
      camera.aspect = container.clientWidth / container.clientHeight;
      if (aspect < 0.8) {
        camera.fov = NARROW_FOV;
      } else {
        camera.fov = BASE_FOV;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);

    // 7. Animation Loop with Fixed Camera + Orbiting Islands
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      // Clamp frame spikes (modal open, GC pause) so islands never jump
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      const activeIdx = focusedIndexRef.current;
      const currentFocusedFactory = factories[activeIdx] || factories[0];

      // Infinite carousel orbit: the camera stays fixed, islands revolve.
      // Ease rotation toward its target so swipes glide slot by slot.
      carouselRot.current = THREE.MathUtils.damp(
        carouselRot.current,
        carouselRotTarget.current,
        4.5,
        delta
      );
      const slotStep = (Math.PI * 2) / factories.length;

      // Update islands floating & highlight animation
      factories.forEach((factory, i) => {
        const group = islandGroupsRef.current[factory.id];
        if (!group) return;

        const isFocused = currentFocusedFactory && currentFocusedFactory.id === factory.id;
        const isHovered = isFocused && hoveredFactoryRef.current?.id === factory.id;

        // Carousel slot: focused island rests at the front (angle 0)
        const angle = i * slotStep + carouselRot.current;
        const orbitX = Math.sin(angle) * 3.8;
        const orbitZ = -0.2 + Math.cos(angle) * 1.4;

        // Hero elevation for the focused island + gentle hover on center island only
        const focusLift = isFocused ? 0.32 : 0;
        const hoverLift = isHovered ? 0.12 : 0; // "pequeño hover"
        const bob = Math.sin(elapsed * 1.5 + i * 2.1) * (isFocused ? 0.12 : 0.07);

        const targetY = factory.islandPosition[1] + bob + focusLift + hoverLift;

        // Compact scale so each island fits fully in frame
        const targetScale = isFocused ? (isHovered ? 1.0 : 0.96) : 0.84;

        // Entrance progress for this island: staggered one-by-one from far.
        // Direct set (no incremental lerp) avoids double-animation jumps;
        // once done, the normal carousel lerp below takes over seamlessly.
        const entranceRaw = prefersReducedMotion
          ? 1
          : THREE.MathUtils.clamp((elapsed - i * ENTRANCE_STAGGER) / ENTRANCE_DURATION, 0, 1);
        if (entranceRaw < 1) {
          const entranceEase = easeOutCubic(entranceRaw);
          group.position.set(
            THREE.MathUtils.lerp(orbitX * 1.5, orbitX, entranceEase),
            THREE.MathUtils.lerp(targetY + ENTRANCE_FAR_Y, targetY, entranceEase),
            THREE.MathUtils.lerp(orbitZ + ENTRANCE_FAR_Z, orbitZ, entranceEase)
          );
          group.scale.setScalar(
            THREE.MathUtils.lerp(ENTRANCE_START_SCALE, targetScale, entranceEase)
          );
        } else {
          group.position.x = THREE.MathUtils.lerp(group.position.x, orbitX, 0.12);
          group.position.z = THREE.MathUtils.lerp(group.position.z, orbitZ, 0.12);
          group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.1);
          group.scale.setScalar(
            THREE.MathUtils.lerp(group.scale.x, targetScale, 0.08)
          );
        }
        group.rotation.y = Math.sin(elapsed * 0.3 + i) * 0.05;
      });

      // Fixed camera: only subtle mouse/drag parallax, the islands do the moving.
      // Skipped while diving so the dive zoom targets survive untouched.
      if (!activeFactoryRef.current) {
        const dragInfluence = (liveDragOffsetRef.current / (container.clientWidth || 1000)) * 1.2;
        const frameAspect = container.clientWidth / (container.clientHeight || 1);
        const baseZ = frameAspect < 0.8 ? 8.6 * NARROW_DISTANCE_FACTOR : 8.6;

        targetCameraPos.current.set(
          mousePos.current.x * 0.6 - dragInfluence,
          3.6 + mousePos.current.y * 0.35,
          baseZ
        );

        targetLookAt.current.set(
          -dragInfluence * 0.35,
          1.0,
          0.2
        );
      }

      // Smooth camera interpolation for cinematic feel
      currentCameraPos.current.lerp(targetCameraPos.current, 0.045);
      currentLookAt.current.lerp(targetLookAt.current, 0.045);

      camera.position.copy(currentCameraPos.current);
      camera.lookAt(currentLookAt.current);

      try {
        renderer?.render(scene, camera);
        framesRenderedRef.current += 1;
      } catch (error) {
        // Async render failures (context loss mid-session) are invisible to
        // ErrorBoundary: stop the loop and show the 2D fallback, never black.
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        setWebglError(error instanceof Error ? error.message : 'WebGL render failed');
      }
    };

    animate();

    return () => {
      if (renderer !== null && handleContextLost !== null) {
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);

      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (renderer !== null && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer?.dispose();
    };
  }, [factories, goToNextIsland, goToPrevIsland, handleInitiateDive, selectIslandByIndex]);

  // Live theme sync (no scene rebuild): fog wash + key lights follow the
  // global theme in vivo. Dark restores the original night values exactly.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const light = theme === 'light';
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(light ? 0xf3e7d3 : 0x130905);
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.color.set(light ? 0xfff6e8 : 0xffeedd);
      ambientLightRef.current.intensity = light ? 1.25 : 1.05;
    }
    if (sunLightRef.current) {
      sunLightRef.current.color.set(light ? 0xfff1d6 : 0xffdfa9);
      sunLightRef.current.intensity = light ? 2.0 : 2.3;
    }
    if (goldFillRef.current) {
      goldFillRef.current.color.set(light ? 0xc9962e : 0xd4af37);
      goldFillRef.current.intensity = light ? 0.9 : 1.25;
    }
    if (pointLightRef.current) {
      pointLightRef.current.color.set(light ? 0xffd9a0 : 0xffa500);
      pointLightRef.current.intensity = light ? 1.6 : 2.2;
    }
  }, [theme]);

  const focusedFactory = factories[focusedIndex] || factories[0];

  // Graceful 2D fallback: factory navigation stays usable without WebGL.
  if (webglError !== null) {
    return (
      <div className="relative w-full h-screen overflow-y-auto bg-[#faf6ef] dark:bg-[#120a06] px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-[#2b1a12] dark:text-[#fcf8f2]">3D unavailable, the tour continues</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#5c4433] dark:text-[#d7c4b7]">
          Your browser blocked WebGL ({webglError}). Pick a factory below to continue.
        </p>
        <div className="mx-auto mt-6 flex max-w-lg flex-col gap-3">
          {factories.map((factory) => (
            <button
              key={factory.id}
              type="button"
              onClick={() => onSelectFactory(factory)}
              className="min-h-[44px] rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] px-4 py-3 text-left text-[#2b1a12] dark:text-[#fcf8f2] border border-[#d4af37]/40 font-bold cursor-pointer"
            >
              {factory.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
      <div className="relative w-full h-screen overflow-hidden bg-[radial-gradient(ellipse_at_center,#fdf8ec_0%,#f7ecd4_45%,#efddba_75%,#e6cfa4_100%)] dark:bg-[radial-gradient(ellipse_at_center,#6e3c12_0%,#3d1e08_38%,#180b04_68%,#070302_100%)] select-none">
      
      {/* 3D Canvas Mount Point with Touch Action None to enable smooth touch dragging */}
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none z-0"
      />

      {/* Atmospheric Vignette & Horizon Glow */}
      <div className="absolute inset-0 pointer-events-none bg-radial-[at_50%_40%] from-transparent via-[#d9c49a]/25 dark:via-[#140a05]/40 to-[#c9a86a]/35 dark:to-[#0c0502]/90" />

      {/* Floating Left & Right Navigation Chevrons */}
      <button
        onClick={goToPrevIsland}
        aria-label="Isla anterior"
        className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-[#fffdf8]/80 dark:bg-[#1c100a]/80 hover:bg-[#f3e7d3] hover:dark:bg-[#2b170e] border border-[#d4af37]/35 hover:border-[#d4af37] text-[#8a6216] dark:text-[#e5c158] hover:text-[#2b1a12] hover:dark:text-[#fff] backdrop-blur-xl shadow-2xl shadow-black/70 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer group"
      >
        <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
      </button>

      <button
        onClick={goToNextIsland}
        aria-label="Siguiente isla"
        className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-[#fffdf8]/80 dark:bg-[#1c100a]/80 hover:bg-[#f3e7d3] hover:dark:bg-[#2b170e] border border-[#d4af37]/35 hover:border-[#d4af37] text-[#8a6216] dark:text-[#e5c158] hover:text-[#2b1a12] hover:dark:text-[#fff] backdrop-blur-xl shadow-2xl shadow-black/70 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer group"
      >
        <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* Focused Island HUD Card (collapsible; collapsed state persists) */}
      <AnimatePresence mode="wait">
        {focusedFactory && !activeFactory && (
          isHudCollapsed ? (
            <motion.div
              key={`${focusedFactory.id}-collapsed`}
              initial={{ opacity: 0, y: 25, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute bottom-8 sm:bottom-10 md:bottom-12 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-lg pointer-events-auto"
            >
              <div className="bg-[#fffdf8]/92 dark:bg-[#1c100a]/92 backdrop-blur-2xl border border-[#d4af37]/45 rounded-2xl px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 shadow-2xl shadow-black/90">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 shrink-0 rounded-full ring-2 ring-[#d4af37]/30"
                    style={{ backgroundColor: focusedFactory.accentColor }}
                  />
                  <h3 className="truncate text-base sm:text-lg font-bold text-[#2b1a12] dark:text-[#fcf8f2] font-serif-luxury">
                    {focusedFactory.name}
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSucursalesOpen(true)}
                    aria-label={`Ver sucursales de ${focusedFactory.name}`}
                    className="min-h-[44px] px-3 sm:px-4 py-2 rounded-xl border border-[#d4af37]/50 bg-transparent text-[#8a6216] dark:text-[#e5c158] font-bold text-xs flex shrink-0 items-center gap-1.5 hover:bg-[#d4af37]/15 hover:border-[#d4af37] active:scale-95 transition-all cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mapa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInitiateDive(focusedFactory)}
                    aria-label={`Entrar a la Isla ${focusedFactory.name}`}
                    className="min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] dark:via-[#e5c158] to-[#b8860b] text-[#1a0f08] font-bold text-xs flex shrink-0 items-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#d4af37]/30 cursor-pointer"
                  >
                    <span className="sm:hidden">Entrar</span>
                    <span className="hidden sm:inline">Entrar a la Isla</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#1a0f08]" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleHudCollapsed}
                    aria-expanded={false}
                    aria-label="Mostrar información de la isla"
                    className="min-w-[44px] min-h-[44px] w-11 h-11 shrink-0 rounded-xl bg-[#efe0c6] dark:bg-[#2e1910] border border-[#d4af37]/30 text-[#8a6216] dark:text-[#e5c158] hover:text-[#2b1a12] hover:dark:text-white hover:border-[#d4af37] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
          <motion.div
            key={focusedFactory.id}
            initial={{ opacity: 0, y: 25, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-8 sm:bottom-10 md:bottom-12 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-lg pointer-events-auto"
          >
            <div className="bg-[#fffdf8]/92 dark:bg-[#1c100a]/92 backdrop-blur-2xl border border-[#d4af37]/45 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-black/90">
              
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-2 ring-[#d4af37]/30"
                      style={{ backgroundColor: focusedFactory.accentColor }}
                    />
                    <span className="text-xs uppercase font-bold tracking-wider text-[#d4af37]">
                      Fábrica Emblemática
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#2b1a12] dark:text-[#fcf8f2] font-serif-luxury mt-0.5">
                    {focusedFactory.name}
                  </h3>
                  <p className="text-[11px] text-[#8a6216] dark:text-[#e5c158] italic font-serif-luxury">
                    "{focusedFactory.slogan}"
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] border border-[#d4af37]/30 text-xs text-[#8a6216] dark:text-[#e5c158] font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>{focusedFactory.foundationYear}</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleHudCollapsed}
                    aria-expanded={!isHudCollapsed}
                    aria-label="Ocultar información de la isla"
                    className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#efe0c6] dark:bg-[#2e1910] border border-[#d4af37]/30 text-[#8a6216] dark:text-[#e5c158] hover:text-[#2b1a12] hover:dark:text-white hover:border-[#d4af37] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-[#5c4433] dark:text-[#d7c4b7] line-clamp-2 mb-3 leading-relaxed">
                {focusedFactory.description}
              </p>

              {/* Bottom Actions & Location */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2.5 border-t border-[#d4af37]/20">
                <div className="text-[11px] text-[#7a5c48] dark:text-[#bda393] flex min-w-0 flex-1 items-center gap-1 max-w-[210px]">
                  <MapPin className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
                  <span className="truncate">{focusedFactory.headquarters}</span>
                </div>

                {/* Primary Dive Button */}
                <button
                  type="button"
                  onClick={() => setSucursalesOpen(true)}
                  aria-label={`Ver sucursales de ${focusedFactory.name}`}
                  className="min-h-[44px] px-3 sm:px-4 py-2 rounded-xl border border-[#d4af37]/50 bg-transparent text-[#8a6216] dark:text-[#e5c158] font-bold text-xs flex shrink-0 items-center gap-1.5 hover:bg-[#d4af37]/15 hover:border-[#d4af37] active:scale-95 transition-all cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Cómo llegar</span>
                </button>
                <button
                  onClick={() => handleInitiateDive(focusedFactory)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] dark:via-[#e5c158] to-[#b8860b] text-[#1a0f08] font-bold text-xs flex shrink-0 items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#d4af37]/30 cursor-pointer"
                >
                  <span>Entrar a la Isla</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#1a0f08]" />
                </button>
              </div>

            </div>
          </motion.div>
          ))}
      </AnimatePresence>

      {/* Cinematic Dive Transition overlay */}
      <AnimatePresence>
        {activeFactory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
            className="absolute inset-0 z-40 bg-[#faf6ef] dark:bg-[#120a06] flex flex-col items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="text-center px-4"
            >
              <h3 className="text-2xl sm:text-4xl font-bold text-[#2b1a12] dark:text-[#fcf8f2] font-royal">
                Adentrándose en {activeFactory.name}
              </h3>
              <p className="text-sm text-[#8a6216] dark:text-[#e5c158] mt-2 font-serif-luxury italic">
                Abriendo la Sala de Productos...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SucursalesModal
        open={sucursalesOpen}
        onClose={() => setSucursalesOpen(false)}
        factoryId={focusedFactory.id}
        factoryName={focusedFactory.name}
      />

    </div>
  );
};
