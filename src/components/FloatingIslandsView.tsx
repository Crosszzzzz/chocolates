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
  ChevronDown
} from 'lucide-react';
import { ChocolateFactory } from '../types/chocolate';
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

  // Collapsible HUD card: collapsed by default, resets on island change
  const [isCardExpanded, setIsCardExpanded] = useState<boolean>(false);

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
  const cameraDistRef = useRef<number>(5.9);
  const prefersReducedMotionRef = useRef<boolean>(false);

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
    setIsCardExpanded(false);
    setFocusedIndex((prev) => {
      const next = (prev + 1) % factories.length;
      playIslandSlideSound();
      return next;
    });
  }, [factories.length]);

  const goToPrevIsland = useCallback(() => {
    if (activeFactoryRef.current) return;
    setIsCardExpanded(false);
    setFocusedIndex((prev) => {
      const next = (prev - 1 + factories.length) % factories.length;
      playIslandSlideSound();
      return next;
    });
  }, [factories.length]);

  const selectIslandByIndex = useCallback((index: number) => {
    if (activeFactoryRef.current) return;
    if (index >= 0 && index < factories.length) {
      setIsCardExpanded(false);
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
      factory.islandPosition[1] - 0.1,
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
    scene.fog = new THREE.FogExp2(0x130905, 0.045);

    // 2. Camera Setup (responsive: portrait pulls back + widens fov)
    const getResponsiveCamera = (w: number, h: number) => {
      const aspect = w / Math.max(h, 1);
      let fov = 45;
      let dist = 5.9;
      if (aspect < 0.8) {
        fov = 62;
        dist = 9.8;
      } else if (aspect < 1.2) {
        fov = 54;
        dist = 7.4;
      }
      return { fov, dist };
    };
    prefersReducedMotionRef.current =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const initialResponsive = getResponsiveCamera(
      container.clientWidth,
      container.clientHeight
    );
    cameraDistRef.current = initialResponsive.dist;
    const camera = new THREE.PerspectiveCamera(
      initialResponsive.fov,
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
      group.add(topPlateau);

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

      // Architectural Feature for each Factory (procedural + optional photo facade)
      const applyFacadeTexture = (body: THREE.Mesh, facade?: string) => {
        if (!facade) return;
        new THREE.TextureLoader().load(
          facade,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const mat = body.material as THREE.MeshStandardMaterial;
            mat.map = tex;
            mat.needsUpdate = true;
          },
          undefined,
          () => {
            // 404 or missing file -> keep improved procedural fallback
          }
        );
      };

      // Para Ti: foto real recortada al edificio central (cielo/calle/camionetas fuera),
      // aplicada SOLO a la cara frontal (+z) con multi-material; laterales = enlucido.
      const PARA_TI_FACADE_CROP = { repeatX: 0.62, repeatY: 0.55, offsetX: 0.19, offsetY: 0.28 };
      const applyParaTiFacade = (body: THREE.Mesh, facade?: string) => {
        if (!facade) return;
        new THREE.TextureLoader().load(
          facade,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.repeat.set(PARA_TI_FACADE_CROP.repeatX, PARA_TI_FACADE_CROP.repeatY);
            tex.offset.set(PARA_TI_FACADE_CROP.offsetX, PARA_TI_FACADE_CROP.offsetY);
            const side = body.material as THREE.MeshStandardMaterial;
            const front = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              map: tex,
              emissive: 0x332211,
              emissiveIntensity: 0.25,
              emissiveMap: tex,
              roughness: 0.8
            });
            // Box material order: [+x, -x, +y, -y, +z frontal, -z]
            body.material = [side, side, side, side, front, side];
          },
          undefined,
          () => {
            // missing file -> keep procedural fallback intact
          }
        );
      };

      if (factory.id === 'para-ti') {
        // Para Ti — esquina blanca industrial: cuerpo hueso + zocalo piedra,
        // tira de ventanas verticales, remate noche, letrero dorado, arboles + reja
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 1.1, 1.0),
          new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 })
        );
        body.position.set(0, 0.85, 0);
        body.castShadow = true;
        group.add(body);
        applyParaTiFacade(body, factory.facade);

        const plinth = new THREE.Mesh(
          new THREE.BoxGeometry(1.85, 0.25, 1.05),
          new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.85 })
        );
        plinth.position.set(0, 0.32, 0);
        group.add(plinth);

        const glassMat = new THREE.MeshStandardMaterial({
          color: 0x2b3a4a,
          roughness: 0.35,
          emissive: 0x1a2733,
          emissiveIntensity: 0.35
        });
        for (let i = 0; i < 6; i++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.02), glassMat);
          win.position.set(-0.62 + i * 0.25, 0.9, 0.51);
          group.add(win);
        }

        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.4, 0.7),
          new THREE.MeshStandardMaterial({ color: 0x1c2b4a, roughness: 0.8 })
        );
        crown.position.set(0, 1.6, -0.05);
        group.add(crown);

        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.18, 0.02),
          new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.5,
            emissive: 0x664d0f,
            emissiveIntensity: 0.6
          })
        );
        sign.position.set(0, 1.25, 0.52);
        group.add(sign);

        // 2 arboles laterales
        [[-1.15, 0.5], [1.15, 0.5]].forEach(([tx, tz]) => {
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.08, 0.5, 5),
            new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.8 })
          );
          trunk.position.set(tx, 0.5, tz);
          group.add(trunk);
          const foliage = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.32, 1),
            new THREE.MeshStandardMaterial({ color: 0x1b4d20, roughness: 0.8 })
          );
          foliage.position.set(tx, 0.95, tz);
          group.add(foliage);
        });

        // Reja baja frontal
        const fence = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 0.12, 0.04),
          new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.4 })
        );
        fence.position.set(0, 0.4, 1.0);
        group.add(fence);

      } else if (factory.id === 'chocolates-sucre') {
        // Sucre — casa colonial blanca con zocalo piedra, techo teja piramidal,
        // puerta madera, capillita calida y farola
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, 0.9, 0.9),
          new THREE.MeshStandardMaterial({ color: 0xf8f5ee, roughness: 0.8 })
        );
        body.position.set(-0.1, 0.75, 0);
        body.castShadow = true;
        group.add(body);
        applyFacadeTexture(body, factory.facade);

        const plinth = new THREE.Mesh(
          new THREE.BoxGeometry(1.75, 0.28, 0.95),
          new THREE.MeshStandardMaterial({ color: 0x8a6f5c, roughness: 0.85 })
        );
        plinth.position.set(-0.1, 0.32, 0);
        group.add(plinth);

        // Techo teja: piramide de 4 lados rotada 45°
        const roofGeo = new THREE.CylinderGeometry(0, 1.15, 0.5, 4);
        const roof = new THREE.Mesh(
          roofGeo,
          new THREE.MeshStandardMaterial({ color: 0xa34a28, roughness: 0.8, flatShading: true })
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.set(-0.1, 1.45, 0);
        group.add(roof);

        const door = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.6, 0.03),
          new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.8 })
        );
        door.position.set(-0.1, 0.55, 0.47);
        group.add(door);

        // Capillita con luz calida
        const chapel = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.35, 0.06),
          new THREE.MeshStandardMaterial({
            color: 0xfff2d9,
            roughness: 0.7,
            emissive: 0xffb45e,
            emissiveIntensity: 0.55
          })
        );
        chapel.position.set(0.55, 0.85, 0.46);
        group.add(chapel);

        // Farola pequeña
        const lampPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.04, 0.7, 6),
          new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 })
        );
        lampPost.position.set(-0.9, 0.6, 0.7);
        group.add(lampPost);
        const lampHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 8, 8),
          new THREE.MeshStandardMaterial({
            color: 0xffe6b0,
            emissive: 0xffc46b,
            emissiveIntensity: 0.9
          })
        );
        lampHead.position.set(-0.9, 1.0, 0.7);
        group.add(lampHead);

        // Cascada de chocolate (legado visual)
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
        // Taboada — fachada piedra iluminada, porton madera, spots, mastil + furgoneta
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, 1.2, 0.9),
          new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.8 })
        );
        body.position.set(0.1, 0.8, 0);
        body.castShadow = true;
        group.add(body);
        applyFacadeTexture(body, factory.facade);

        // Pilastras laterales marron
        [-0.85, 1.05].forEach((px) => {
          const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 1.25, 0.95),
            new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 })
          );
          pillar.position.set(px, 0.8, 0);
          group.add(pillar);
        });

        // Porton madera
        const gate = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.75, 0.03),
          new THREE.MeshStandardMaterial({ color: 0x4a2c17, roughness: 0.8 })
        );
        gate.position.set(0.1, 0.6, 0.47);
        group.add(gate);

        // 3 spots calidos sobre la fachada
        const spotMat = new THREE.MeshStandardMaterial({
          color: 0xfff6e0,
          emissive: 0xffe0a3,
          emissiveIntensity: 1.0
        });
        [-0.4, 0.1, 0.6].forEach((sx) => {
          const spot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), spotMat);
          spot.position.set(sx, 1.25, 0.47);
          group.add(spot);
        });

        // Mastil fino + bandera
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6),
          new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.6 })
        );
        mast.position.set(0.85, 1.6, -0.2);
        group.add(mast);
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.18, 0.01),
          new THREE.MeshStandardMaterial({ color: 0xb01919, roughness: 0.8 })
        );
        flag.position.set(1.0, 1.95, -0.2);
        group.add(flag);

        // Furgoneta blanca simple al frente
        const vanBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.28, 0.28),
          new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 })
        );
        vanBody.position.set(-0.35, 0.42, 0.95);
        group.add(vanBody);
        const vanCab = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.22, 0.26),
          new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.8 })
        );
        vanCab.position.set(0.02, 0.4, 0.95);
        group.add(vanCab);
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
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      const aspect = w / Math.max(h, 1);
      if (aspect < 0.8) {
        camera.fov = 62;
        cameraDistRef.current = 9.8;
      } else if (aspect < 1.2) {
        camera.fov = 54;
        cameraDistRef.current = 7.4;
      } else {
        camera.fov = 45;
        cameraDistRef.current = 5.9;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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

      // Rotate dust particles smoothly (skip when reduced motion)
      if (dustParticlesRef.current && !prefersReducedMotionRef.current) {
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
        const bob = prefersReducedMotionRef.current
          ? 0
          : Math.sin(elapsed * 1.5 + i * 2.1) * (isFocused ? 0.12 : 0.07);

        const targetY = factory.islandPosition[1] + bob + focusLift + hoverLift;
        group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.1);
        group.rotation.y = Math.sin(elapsed * 0.3 + i) * 0.05;

        // Subtle scale: focused island is prominent, with a gentle touch on hover
        const targetScale = isFocused ? (isHovered ? 1.08 : 1.06) : 0.88;
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
          fz + cameraDistRef.current
        );

        // Vertical air: hero gone + collapsed card -> frame the island higher.
        // Desktop aims slightly below center (fy - 0.1), portrait lower (fy - 0.6).
        const frameAspect = container.clientWidth / Math.max(container.clientHeight, 1);
        const lookYOffset = frameAspect < 0.8 ? -0.6 : -0.1;

        targetLookAt.current.set(
          fx - dragInfluence * 0.35,
          fy + lookYOffset,
          fz
        );
      }

      // Smooth camera interpolation for cinematic feel (instant when reduced motion)
      const lerpFactor = prefersReducedMotionRef.current ? 1 : 0.045;
      currentCameraPos.current.lerp(targetCameraPos.current, lerpFactor);
      currentLookAt.current.lerp(targetLookAt.current, lerpFactor);

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

  const focusedFactory = factories[focusedIndex] || factories[0];

  return (
    <div className="relative w-full h-app overflow-hidden bg-gradient-to-b from-[#180d07] via-[#221209] to-[#0e0603] select-none">
      
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
        className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none rounded-2xl bg-[#1c100a]/80 hover:bg-[#2b170e] border border-[#d4af37]/35 hover:border-[#d4af37] text-[#e5c158] hover:text-[#fff] backdrop-blur-xl shadow-2xl shadow-black/70 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer group"
      >
        <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
      </button>

      <button
        onClick={goToNextIsland}
        aria-label="Siguiente isla"
        className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none rounded-2xl bg-[#1c100a]/80 hover:bg-[#2b170e] border border-[#d4af37]/35 hover:border-[#d4af37] text-[#e5c158] hover:text-[#fff] backdrop-blur-xl shadow-2xl shadow-black/70 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer group"
      >
        <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* Focused Island HUD Card (collapsible: name + year by default) */}
      <AnimatePresence mode="wait">
        {focusedFactory && !activeFactory && (
          <motion.div
            key={focusedFactory.id}
            initial={{ opacity: 0, y: 25, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-20 md:bottom-22 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-lg pointer-events-auto"
          >
            <div className="bg-[#1c100a]/95 backdrop-blur border border-[#d4af37]/45 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden">

              {/* Collapsed header: always visible (~64px) */}
              <button
                onClick={() => setIsCardExpanded((v) => !v)}
                aria-expanded={isCardExpanded}
                aria-label={isCardExpanded ? `Colapsar ${focusedFactory.name}` : `Expandir ${focusedFactory.name}`}
                className="w-full flex items-center justify-between gap-3 min-h-[64px] px-4 sm:px-5 py-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none text-left"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full ring-2 ring-[#d4af37]/30 shrink-0"
                    style={{ backgroundColor: focusedFactory.accentColor }}
                  />
                  <span className="text-base sm:text-lg font-bold text-[#fcf8f2] font-serif-luxury truncate">
                    {focusedFactory.name}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2e1910] border border-[#d4af37]/30 text-xs text-[#e5c158] font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>{focusedFactory.foundationYear}</span>
                  </span>
                  <span className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#2e1910] border border-[#d4af37]/30 text-[#e5c158]">
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isCardExpanded ? 'rotate-180' : ''}`} />
                  </span>
                </span>
              </button>

              {/* Expanded content: slogan, description, address, dots, dive CTA */}
              <AnimatePresence initial={false}>
                {isCardExpanded && (
                  <motion.div
                    key="card-details"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                      <p className="text-[11px] text-[#e5c158] italic font-serif-luxury mb-2">
                        "{focusedFactory.slogan}"
                      </p>

                      {/* Description */}
                      <p className="text-xs text-[#d7c4b7] line-clamp-3 mb-3 leading-relaxed">
                        {focusedFactory.description}
                      </p>

                      {/* Bottom Actions & Location */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-[#d4af37]/20">
                        <div className="text-[11px] text-[#bda393] flex items-center gap-1 max-w-[210px]">
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
                              className="min-h-[44px] min-w-[44px] -m-2 p-2 flex items-center justify-center rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none"
                            >
                              <span
                                className={`block transition-all duration-300 rounded-full ${
                                  idx === focusedIndex
                                    ? 'w-6 h-2 bg-gradient-to-r from-[#d4af37] to-[#e5c158] shadow-sm shadow-[#d4af37]'
                                    : 'w-2 h-2 bg-[#4a2e1f] hover:bg-[#8b5a2b]'
                                }`}
                              />
                            </button>
                          ))}
                        </div>

                        {/* Primary Dive Button */}
                        <button
                          onClick={() => handleInitiateDive(focusedFactory)}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c158] to-[#b8860b] text-[#1a0f08] font-bold text-xs flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#d4af37]/30 cursor-pointer"
                        >
                          <span>Entrar a la Isla</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#1a0f08]" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}
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
