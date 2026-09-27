import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  ArrowRight,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Info
} from 'lucide-react';
import { ChocolateFactory } from '../types/chocolate';
import {
  getIslandFacadeUrl,
  isIslandFacadeLoaded,
  preloadIslandFacade,
} from '../utils/islandFacade';
import {
  playIslandDiveChime,
  playPedestalHum,
  playIslandSlideSound
} from '../utils/audio';

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
  
  // Focused island index (default to 1: Chocolates Sucre in the center, or 0 if single)
  const [focusedIndex, setFocusedIndex] = useState<number>(1);
  const focusedIndexRef = useRef<number>(1);
  focusedIndexRef.current = focusedIndex;

  // Collapsible HUD card state (persisted; collapsed card becomes a small FAB)
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(HUD_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

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

  // Tracks which optional image facades finished preloading (procedural stays otherwise)
  const [facadeReady, setFacadeReady] = useState<Record<string, boolean>>({});

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
  const haloRingsRef = useRef<{ [key: string]: THREE.Mesh }>({});
  const dustParticlesRef = useRef<THREE.Points | null>(null);

  const targetCameraPos = useRef(new THREE.Vector3(0, 3.2, 7.0));
  const currentCameraPos = useRef(new THREE.Vector3(0, 3.2, 7.0));
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

  // Navigation handlers
  const goToNextIsland = useCallback(() => {
    if (activeFactoryRef.current) return;
    setFocusedIndex((prev) => {
      const next = (prev + 1) % factories.length;
      playIslandSlideSound();
      return next;
    });
  }, [factories.length]);

  const goToPrevIsland = useCallback(() => {
    if (activeFactoryRef.current) return;
    setFocusedIndex((prev) => {
      const next = (prev - 1 + factories.length) % factories.length;
      playIslandSlideSound();
      return next;
    });
  }, [factories.length]);

  const selectIslandByIndex = useCallback((index: number) => {
    if (activeFactoryRef.current) return;
    if (index >= 0 && index < factories.length) {
      setFocusedIndex(index);
      playIslandSlideSound();
    }
  }, [factories.length]);

  // Initiate cinematic dive into the selected island
  const handleInitiateDive = useCallback((factory: ChocolateFactory) => {
    if (activeFactoryRef.current) return;
    activeFactoryRef.current = factory;
    setActiveFactory(factory);
    hoveredFactoryRef.current = null;
    setHoveredFactory(null);
    playIslandDiveChime();

    // Camera zooms deeply into the island coordinates
    targetCameraPos.current.set(
      factory.islandPosition[0] * 0.92,
      factory.islandPosition[1] + 0.6,
      factory.islandPosition[2] + 2.2
    );
    targetLookAt.current.set(
      factory.islandPosition[0],
      factory.islandPosition[1] + 0.4,
      factory.islandPosition[2]
    );

    // After camera travel, trigger parent selection
    setTimeout(() => {
      onSelectFactory(factory);
    }, 1100);
  }, [onSelectFactory]);

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

  // Optional image facades: preload `/images/islands/<id>.jpg` per island.
  // Missing files resolve false via onerror; the procedural render stays.
  useEffect(() => {
    let cancelled = false;
    factories.forEach((factory) => {
      preloadIslandFacade(factory.id).then((ok) => {
        if (ok && !cancelled) {
          setFacadeReady((prev) => (prev[factory.id] ? prev : { ...prev, [factory.id]: true }));
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [factories]);

  // Three.js Scene Setup & Animation Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x130905, 0.045);

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.copy(currentCameraPos.current);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Lighting - Rich Warm Chocolate & Gold
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.8);
    scene.add(ambientLight);

    const mainSun = new THREE.DirectionalLight(0xffdfa9, 1.85);
    mainSun.position.set(6, 12, 8);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 1024;
    mainSun.shadow.mapSize.height = 1024;
    scene.add(mainSun);

    const goldFill = new THREE.DirectionalLight(0xd4af37, 1.25);
    goldFill.position.set(-6, -4, -6);
    scene.add(goldFill);

    const pointLight = new THREE.PointLight(0xffa500, 2.2, 22);
    pointLight.position.set(0, 2, 0);
    scene.add(pointLight);

    // 5. Floating Dust & Gold Cocoa Flakes
    const dustCount = 450;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustScales = new Float32Array(dustCount);

    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 28;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 14 + 1;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      dustScales[i] = Math.random() * 0.08 + 0.02;
    }

    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xf1c40f,
      size: 0.1,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const dustParticles = new THREE.Points(dustGeo, dustMat);
    scene.add(dustParticles);
    dustParticlesRef.current = dustParticles;

    // Helper: Create stylized procedural floating island
    const createIsland = (factory: ChocolateFactory) => {
      const group = new THREE.Group();
      group.position.set(...factory.islandPosition);
      group.userData = { factoryId: factory.id, factory };

      // Island base: Inverted rocky cone with rocky layers
      const baseGeo = new THREE.ConeGeometry(2.3, 3.2, 7);
      baseGeo.rotateX(Math.PI);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x3d2012,
        roughness: 0.85,
        metalness: 0.1,
        flatShading: true
      });
      const islandBase = new THREE.Mesh(baseGeo, baseMat);
      islandBase.position.y = -1.6;
      islandBase.castShadow = true;
      islandBase.receiveShadow = true;
      group.add(islandBase);

      // Top plateau
      const topPlateauGeo = new THREE.CylinderGeometry(2.35, 2.3, 0.45, 7);
      const topPlateauMat = new THREE.MeshStandardMaterial({
        color:
          factory.id === 'para-ti'
            ? 0x2e6930
            : factory.id === 'chocolates-sucre'
            ? 0xe2e8f0
            : 0x4a6b32,
        roughness: 0.7,
        flatShading: true
      });
      const topPlateau = new THREE.Mesh(topPlateauGeo, topPlateauMat);
      topPlateau.position.y = 0.05;
      topPlateau.receiveShadow = true;
      topPlateau.userData.isFacadePlateau = true;
      group.add(topPlateau);

      // Optional image-facade upgrade: if the JPG already preloaded, skin the
      // plateau with it; on missing files / load error keep the procedural material.
      if (isIslandFacadeLoaded(factory.id)) {
        new THREE.TextureLoader().load(
          getIslandFacadeUrl(factory.id),
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            topPlateauMat.map = tex;
            topPlateauMat.needsUpdate = true;
          },
          undefined,
          () => {
            // Missing image: keep procedural fallback untouched
          }
        );
      }

      // Glowing Halo Ring under the island
      const ringGeo = new THREE.RingGeometry(2.4, 2.75, 36);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(factory.accentColor),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      });
      const haloRing = new THREE.Mesh(ringGeo, ringMat);
      haloRing.position.y = -0.15;
      group.add(haloRing);
      haloRingsRef.current[factory.id] = haloRing;

      // Architectural Feature for each Factory
      if (factory.id === 'para-ti') {
        // Red and Gold Sucre Clock Tower & Cocoa Pod
        const towerBase = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1.4, 0.8),
          new THREE.MeshStandardMaterial({ color: 0xb01919, roughness: 0.4 })
        );
        towerBase.position.set(0, 0.9, 0);
        towerBase.castShadow = true;
        group.add(towerBase);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.7, roughness: 0.25 })
        );
        dome.position.set(0, 1.6, 0);
        group.add(dome);

        const treeTrunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 0.7, 5),
          new THREE.MeshStandardMaterial({ color: 0x5c3317 })
        );
        treeTrunk.position.set(0.9, 0.5, 0.6);
        group.add(treeTrunk);

        const treeFoliage = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.4, 1),
          new THREE.MeshStandardMaterial({ color: 0x1b4d20, roughness: 0.8 })
        );
        treeFoliage.position.set(0.9, 1.0, 0.6);
        group.add(treeFoliage);

        const pod = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.35, 6),
          new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 })
        );
        pod.rotation.z = Math.PI * 0.85;
        pod.position.set(0.85, 0.8, 0.6);
        group.add(pod);

      } else if (factory.id === 'chocolates-sucre') {
        // Sucre "Ciudad Blanca" Colonial Bell Gable & Chocolate Cascade
        const churchWall = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1.2, 0.3),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
        );
        churchWall.position.set(-0.2, 0.85, 0);
        churchWall.castShadow = true;
        group.add(churchWall);

        const archTop = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.7, 0.3),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
        );
        archTop.position.set(-0.2, 1.6, 0);
        group.add(archTop);

        const bell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.22, 0.3, 8),
          new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 })
        );
        bell.position.set(-0.2, 1.5, 0);
        group.add(bell);

        const cascadeGeo = new THREE.PlaneGeometry(0.45, 1.8, 4, 12);
        cascadeGeo.rotateX(-0.35);
        const cascadeMat = new THREE.MeshStandardMaterial({
          color: 0x3d1a08,
          roughness: 0.15,
          metalness: 0.4
        });
        const cascade = new THREE.Mesh(cascadeGeo, cascadeMat);
        cascade.position.set(0.9, -0.4, 1.1);
        cascade.rotation.y = 0.5;
        group.add(cascade);

      } else if (factory.id === 'taboada') {
        // Taboada 1948 - Historic red brick factory with industrial chimney & steam
        const factoryBuilding = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.9, 1.1),
          new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.8 })
        );
        factoryBuilding.position.set(0.1, 0.65, 0);
        factoryBuilding.castShadow = true;
        group.add(factoryBuilding);

        const chimney = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.24, 1.6, 8),
          new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 })
        );
        chimney.position.set(-0.5, 1.3, -0.2);
        chimney.castShadow = true;
        group.add(chimney);

        const gear = new THREE.Mesh(
          new THREE.TorusGeometry(0.28, 0.08, 8, 16),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.3 })
        );
        gear.position.set(0.1, 0.65, 0.58);
        group.add(gear);
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
          if (found) {
            playPedestalHum();
          }
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
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);

    // 7. Animation Loop with Dynamic Camera Centering
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Rotate dust particles smoothly
      if (dustParticlesRef.current) {
        dustParticlesRef.current.rotation.y += delta * 0.025;
      }

      const activeIdx = focusedIndexRef.current;
      const currentFocusedFactory = factories[activeIdx] || factories[0];

      // Update islands floating & highlight animation
      factories.forEach((factory, i) => {
        const group = islandGroupsRef.current[factory.id];
        const halo = haloRingsRef.current[factory.id];
        if (!group) return;

        const isFocused = currentFocusedFactory && currentFocusedFactory.id === factory.id;
        const isHovered = isFocused && hoveredFactoryRef.current?.id === factory.id;

        // Hero elevation for the focused island + gentle hover on center island only
        const focusLift = isFocused ? 0.32 : 0;
        const hoverLift = isHovered ? 0.12 : 0; // "pequeño hover"
        const bob = Math.sin(elapsed * 1.5 + i * 2.1) * (isFocused ? 0.12 : 0.07);

        const targetY = factory.islandPosition[1] + bob + focusLift + hoverLift;
        group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.1);
        group.rotation.y = Math.sin(elapsed * 0.3 + i) * 0.05;

        // Subtle scale: focused island is prominent, with a gentle touch on hover
        const targetScale = isFocused ? (isHovered ? 1.08 : 1.04) : 0.92;
        group.scale.setScalar(
          THREE.MathUtils.lerp(group.scale.x, targetScale, 0.08)
        );

        // Halo ring rotation: continuous addition via delta, NEVER restarts or jumps!
        if (halo) {
          const rotationSpeed = isFocused ? (isHovered ? 0.7 : 0.5) : 0.22;
          halo.rotation.z += delta * rotationSpeed;

          const targetOpacity = isFocused ? (isHovered ? 0.92 : 0.8) : 0.12;
          const haloMat = halo.material as THREE.MeshBasicMaterial;
          haloMat.opacity = THREE.MathUtils.lerp(
            haloMat.opacity,
            targetOpacity,
            0.1
          );
        }
      });

      // Frame the currently focused island with the camera
      if (!activeFactoryRef.current && currentFocusedFactory) {
        const [fx, fy, fz] = currentFocusedFactory.islandPosition;
        const dragInfluence = (liveDragOffsetRef.current / (container.clientWidth || 1000)) * 5.0;

        targetCameraPos.current.set(
          fx + mousePos.current.x * 0.6 - dragInfluence,
          fy + 2.3 + mousePos.current.y * 0.35,
          fz + 5.9
        );

        targetLookAt.current.set(
          fx - dragInfluence * 0.35,
          fy + 0.4,
          fz
        );
      }

      // Smooth camera interpolation for cinematic feel
      currentCameraPos.current.lerp(targetCameraPos.current, 0.045);
      currentLookAt.current.lerp(targetLookAt.current, 0.045);

      camera.position.copy(currentCameraPos.current);
      camera.lookAt(currentLookAt.current);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);

      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [factories, onSelectFactory, goToNextIsland, goToPrevIsland, handleInitiateDive, selectIslandByIndex]);

  // When a facade image finishes preloading, skin the plateau in place.
  // Runs again on factories change so scene rebuilds get re-skinned.
  useEffect(() => {
    const ids = Object.keys(facadeReady);
    if (ids.length === 0) return;
    const loader = new THREE.TextureLoader();
    ids.forEach((id) => {
      const group = islandGroupsRef.current[id];
      const plateau = group?.children.find((child) => child.userData?.isFacadePlateau) as THREE.Mesh | undefined;
      if (!plateau) return;
      const mat = plateau.material as THREE.MeshStandardMaterial;
      if (mat.userData?.facadeApplied) return;
      loader.load(
        getIslandFacadeUrl(id),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex;
          mat.needsUpdate = true;
          mat.userData.facadeApplied = true;
        },
        undefined,
        () => {
          // Missing image: keep the procedural fallback untouched
        }
      );
    });
  }, [facadeReady, factories]);

  const focusedFactory = factories[focusedIndex] || factories[0];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-[#180d07] via-[#221209] to-[#0e0603] select-none">
      
      {/* 3D Canvas Mount Point with Touch Action None to enable smooth touch dragging */}
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none z-0"
      />

      {/* Atmospheric Vignette & Horizon Glow */}
      <div className="absolute inset-0 pointer-events-none bg-radial-[at_50%_40%] from-transparent via-[#140a05]/40 to-[#0c0502]/90" />

      {/* Floating Left & Right Navigation Chevrons */}
      <button
        onClick={goToPrevIsland}
        aria-label="Isla anterior"
        className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-[#1c100a]/80 hover:bg-[#2b170e] border border-[#d4af37]/35 hover:border-[#d4af37] text-[#e5c158] hover:text-[#fff] backdrop-blur-xl shadow-2xl shadow-black/70 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer group"
      >
        <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
      </button>

      <button
        onClick={goToNextIsland}
        aria-label="Siguiente isla"
        className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-[#1c100a]/80 hover:bg-[#2b170e] border border-[#d4af37]/35 hover:border-[#d4af37] text-[#e5c158] hover:text-[#fff] backdrop-blur-xl shadow-2xl shadow-black/70 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer group"
      >
        <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* Focused Island HUD Card (collapsible; collapsed state persists) */}
      <AnimatePresence mode="wait">
        {focusedFactory && !activeFactory && (
          isHudCollapsed ? (
            <motion.button
              key="hud-collapsed-fab"
              type="button"
              onClick={toggleHudCollapsed}
              aria-expanded={false}
              aria-label="Mostrar información de la isla"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              className="absolute bottom-20 md:bottom-22 left-1/2 -translate-x-1/2 z-20 min-w-[44px] min-h-[44px] w-12 h-12 rounded-full bg-[#1c100a]/92 backdrop-blur-2xl border border-[#d4af37]/45 text-[#e5c158] shadow-2xl shadow-black/90 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            >
              <Info className="w-5 h-5" />
            </motion.button>
          ) : (
          <motion.div
            key={focusedFactory.id}
            initial={{ opacity: 0, y: 25, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-20 md:bottom-22 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-lg pointer-events-auto"
          >
            <div className="bg-[#1c100a]/92 backdrop-blur-2xl border border-[#d4af37]/45 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-black/90">
              
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
                  <h3 className="text-xl sm:text-2xl font-bold text-[#fcf8f2] font-serif-luxury mt-0.5">
                    {focusedFactory.name}
                  </h3>
                  <p className="text-[11px] text-[#e5c158] italic font-serif-luxury">
                    "{focusedFactory.slogan}"
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2e1910] border border-[#d4af37]/30 text-xs text-[#e5c158] font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>{focusedFactory.foundationYear}</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleHudCollapsed}
                    aria-expanded={!isHudCollapsed}
                    aria-label="Ocultar información de la isla"
                    className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#2e1910] border border-[#d4af37]/30 text-[#e5c158] hover:text-white hover:border-[#d4af37] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-[#d7c4b7] line-clamp-2 mb-3 leading-relaxed">
                {focusedFactory.description}
              </p>

              {/* Bottom Actions & Location */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2.5 border-t border-[#d4af37]/20">
                <div className="text-[11px] text-[#bda393] flex min-w-0 flex-1 items-center gap-1 max-w-[210px]">
                  <MapPin className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
                  <span className="truncate">{focusedFactory.headquarters}</span>
                </div>

                {/* Carousel dots inside card */}
                <div className="flex items-center gap-1.5">
                  {factories.map((f, idx) => (
                    <button
                      key={f.id}
                      onClick={() => selectIslandByIndex(idx)}
                      aria-label={`Ver fábrica ${f.name}`}
                      className={`transition-all duration-300 rounded-full cursor-pointer ${
                        idx === focusedIndex
                          ? 'w-6 h-2 bg-gradient-to-r from-[#d4af37] to-[#e5c158] shadow-sm shadow-[#d4af37]'
                          : 'w-2 h-2 bg-[#4a2e1f] hover:bg-[#8b5a2b]'
                      }`}
                    />
                  ))}
                </div>

                {/* Primary Dive Button */}
                <button
                  onClick={() => handleInitiateDive(focusedFactory)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c158] to-[#b8860b] text-[#1a0f08] font-bold text-xs flex shrink-0 items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#d4af37]/30 cursor-pointer"
                >
                  <span>Entrar a la Isla</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#1a0f08]" />
                </button>
              </div>

            </div>
          </motion.div>
          ))}
      </AnimatePresence>

      {/* Island Quick Selector Bar (Bottom for desktop) */}
      <div className="absolute bottom-5 left-6 right-6 z-10 pointer-events-none hidden md:flex justify-between items-center">
        <div className="flex items-center gap-2 bg-[#1c100a]/85 backdrop-blur-xl px-3.5 py-2 rounded-xl border border-[#d4af37]/25 pointer-events-auto shadow-xl">
          <span className="text-xs text-[#bda393]">Islas patrimoniales:</span>
          {factories.map((f, idx) => {
            const isCurrent = idx === focusedIndex;
            return (
              <button
                key={f.id}
                onClick={() => selectIslandByIndex(idx)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  isCurrent
                    ? 'bg-[#3d2215] text-[#fff] border border-[#d4af37] shadow-sm shadow-[#d4af37]/40 font-semibold'
                    : 'bg-[#24130b] hover:bg-[#2f1a10] text-[#d7c4b7] border border-[#d4af37]/15'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full transition-transform ${isCurrent ? 'scale-125' : ''}`}
                  style={{ backgroundColor: f.accentColor }}
                />
                {f.name}
              </button>
            );
          })}
        </div>

        <div className="text-right text-xs text-[#a08575] pointer-events-auto bg-[#1c100a]/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#d4af37]/10">
          <span>Chuquisaca, Cuna de la Libertad y Capital del Chocolate</span>
        </div>
      </div>

      {/* Cinematic Dive Transition overlay */}
      <AnimatePresence>
        {activeFactory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
            className="absolute inset-0 z-40 bg-[#120a06] flex flex-col items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="text-center px-4"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#d4af37] to-[#8b5a2b] p-0.5 shadow-2xl shadow-[#d4af37]/40 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-[#1a0f08]" />
              </div>
              <h3 className="text-2xl sm:text-4xl font-bold text-[#fcf8f2] font-royal">
                Adentrándose en {activeFactory.name}
              </h3>
              <p className="text-sm text-[#e5c158] mt-2 font-serif-luxury italic">
                Abriendo las puertas del pasillo patrimonial...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
