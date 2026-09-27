import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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
  Info
} from 'lucide-react';
import { ProductSpec, ChocolateFactory } from '../types/chocolate';
import { useCart } from '../contexts/CartContext';
import { toCommerce } from '../data/factories';
import { playFoilTearSound, playChocolateSnapSound } from '../utils/audio';
import {
  type WrapState,
  nextWrapState,
  pieceTransform,
  loadWrapState,
  saveWrapState,
} from '../utils/wrapper';

interface UnwrappingModalViewProps {
  product: ProductSpec;
  factory: ChocolateFactory;
  onBackToChamber: () => void;
  onOpenAr?: () => void;
}

interface WrapperPiece {
  mesh: THREE.Mesh;
  initialPos: THREE.Vector3;
  initialRot: THREE.Euler;
  torn: boolean;
  velocity: THREE.Vector3;
  rotVelocity: THREE.Vector3;
  opacity: number;
}

// M4: label for the state that `advanceWrapState` will transition to.
const NEXT_LABEL: Record<WrapState, string> = {
  peeking: 'Entreabrir',
  unwrapped: 'Desenvolver',
  wrapped: 'Envolver',
};

export const UnwrappingModalView: React.FC<UnwrappingModalViewProps> = ({
  product,
  factory,
  onBackToChamber,
  onOpenAr
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unwrapProgress, setUnwrapProgress] = useState<number>(0);
  const [isFullyUnwrapped, setIsFullyUnwrapped] = useState<boolean>(false);
  const [isDraggingToTear, setIsDraggingToTear] = useState<boolean>(false);
  const [isOrbiting, setIsOrbiting] = useState<boolean>(false);
  // PR3 cart overlay hook (overlay-only, never inside RAF/pointer handlers).
  const { add, warning } = useCart();
  const commerce = toCommerce(product);
  const sku = commerce.sku;

  // M4: 3-state wrap machine (wrapped → peeking → unwrapped → wrapped),
  // persisted per sku so a future AR view can resume it.
  const [wrapState, setWrapState] = useState<WrapState>(() => loadWrapState(sku) ?? 'wrapped');
  const wrapStateRef = useRef<WrapState>(wrapState);
  const setWrap = (s: WrapState) => {
    wrapStateRef.current = s;
    setWrapState(s);
    saveWrapState(sku, s);
  };

  // Apply a wrap state's static visuals to existing pieces (no animation).
  // wrapped/unwrapped match the existing rewrap/torn end-states exactly.
  const applyWrapVisual = (state: WrapState) => {
    const pieces = wrapperPiecesRef.current;
    if (pieces.length === 0) return;
    if (state === 'peeking') {
      pieces.forEach((piece, idx) => {
        const t = pieceTransform('peeking', idx);
        piece.torn = false;
        piece.opacity = t.opacity;
        piece.mesh.visible = true;
        piece.mesh.position.set(
          piece.initialPos.x + Math.sign(piece.initialPos.x || (idx % 2 === 0 ? 1 : -1)) * t.displacement * 0.18,
          piece.initialPos.y + t.displacement * 0.12,
          piece.initialPos.z + t.displacement * 0.35
        );
        piece.mesh.rotation.set(
          piece.initialRot.x + t.rotation * 0.25,
          piece.initialRot.y + t.rotation * 0.2,
          piece.initialRot.z + t.rotation * 0.15
        );
        (piece.mesh.material as THREE.MeshStandardMaterial).opacity = t.opacity;
      });
      setUnwrapProgress(0.5);
      setIsFullyUnwrapped(false);
    } else if (state === 'unwrapped') {
      pieces.forEach((piece) => {
        piece.torn = true;
        piece.opacity = 0;
        piece.mesh.visible = false;
        (piece.mesh.material as THREE.MeshStandardMaterial).opacity = 0;
      });
      setUnwrapProgress(1);
      setIsFullyUnwrapped(true);
    } else {
      pieces.forEach((piece) => {
        piece.torn = false;
        piece.opacity = 1;
        piece.mesh.visible = true;
        piece.mesh.position.copy(piece.initialPos);
        piece.mesh.rotation.copy(piece.initialRot);
        (piece.mesh.material as THREE.MeshStandardMaterial).opacity = 1;
      });
      setUnwrapProgress(0);
      setIsFullyUnwrapped(false);
    }
  };

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const chocolateBarGroupRef = useRef<THREE.Group | null>(null);
  const wrapperPiecesRef = useRef<WrapperPiece[]>([]);
  const isInteractingRef = useRef<boolean>(false);
  const mousePreviousPos = useRef({ x: 0, y: 0 });

  // Generate Branded Wrapper Texture for 3D sleeve
  const createWrapperTexture = (prod: ProductSpec, fac: ChocolateFactory): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Primary brand sleeve background
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 1024);
    bgGrad.addColorStop(0, prod.wrapperPrimaryColor);
    bgGrad.addColorStop(1, '#150804');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Ornate Gold Frame
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 18;
    ctx.strokeRect(36, 36, 952, 952);

    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 4;
    ctx.strokeRect(58, 58, 908, 908);

    // Factory Header
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 44px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(fac.name.toUpperCase(), 512, 160);

    ctx.fillStyle = '#e6d5c3';
    ctx.font = '24px sans-serif';
    ctx.fillText('SUCRE - BOLIVIA • DESDE ' + fac.foundationYear, 512, 210);

    // Golden Cocoa Pod Emblem
    ctx.beginPath();
    ctx.arc(512, 330, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#d4af37';
    ctx.fill();
    ctx.fillStyle = '#1c100a';
    ctx.font = 'bold 36px "Cinzel", serif';
    ctx.fillText('CACAO', 512, 342);

    // Product Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "Playfair Display", serif';
    ctx.fillText(prod.cacaoPercentage + '% CACAO', 512, 490);

    ctx.fillStyle = '#f1c40f';
    ctx.font = '36px "Playfair Display", serif';
    ctx.fillText(prod.name.length > 28 ? prod.name.slice(0, 28) + '...' : prod.name, 512, 560);

    // Origin
    ctx.fillStyle = '#e5c158';
    ctx.font = 'italic 28px sans-serif';
    ctx.fillText(prod.origin, 512, 630);

    // Weight and Specs
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(`PESO NETO ${prod.weight}`, 512, 720);

    // Gold decorative seal at bottom
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(262, 780, 500, 4);
    ctx.font = '22px "Cinzel", serif';
    ctx.fillText('CALIDAD DE EXPORTACIÓN • PATRIMONIO DE SUCRE', 512, 830);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // M4: resume persisted wrap state for this sku (AR continuity).
    const fresh = loadWrapState(toCommerce(product).sku) ?? 'wrapped';
    wrapStateRef.current = fresh;
    setWrapState(fresh);

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
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
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Lighting for ultra-glossy realistic chocolate bar
    const ambient = new THREE.AmbientLight(0xffeedd, 0.9);
    scene.add(ambient);

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

    // 5. Build Chocolate Bar Group
    const barGroup = new THREE.Group();
    chocolateBarGroupRef.current = barGroup;
    scene.add(barGroup);

    // --- Core Molded Chocolate Bar ---
    const barWidth = 1.9;
    const barHeight = 3.2;
    const barDepth = 0.24;

    // Rich physical chocolate material with clearcoat gloss
    const chocolateMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(product.colorHex),
      roughness: 0.28,
      metalness: 0.04,
      clearcoat: 0.65,
      clearcoatRoughness: 0.15,
      reflectivity: 0.8
    });

    // Base slab
    const baseSlab = new THREE.Mesh(
      new THREE.BoxGeometry(barWidth, barHeight, barDepth * 0.7),
      chocolateMat
    );
    baseSlab.castShadow = true;
    baseSlab.receiveShadow = true;
    barGroup.add(baseSlab);

    // Scored chocolate tablet blocks (3 columns x 5 rows = 15 squares)
    const cols = 3;
    const rows = 5;
    const blockW = (barWidth - 0.18) / cols;
    const blockH = (barHeight - 0.24) / rows;
    const blockD = barDepth * 0.45;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = (c - (cols - 1) / 2) * blockW;
        const y = (r - (rows - 1) / 2) * blockH;

        // Beveled pyramid/pillow block
        const blockGeo = new THREE.BoxGeometry(blockW * 0.9, blockH * 0.9, blockD);
        const blockMesh = new THREE.Mesh(blockGeo, chocolateMat);
        blockMesh.position.set(x, y, barDepth * 0.45);
        blockMesh.castShadow = true;
        barGroup.add(blockMesh);

        // Center cocoa bean stamp on middle block
        if (c === 1 && r === 2) {
          const emblemGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16);
          emblemGeo.rotateX(Math.PI / 2);
          const emblemMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(product.colorHex),
            roughness: 0.2,
            metalness: 0.1
          });
          const emblem = new THREE.Mesh(emblemGeo, emblemMat);
          emblem.position.set(x, y, barDepth * 0.68);
          barGroup.add(emblem);
        }
      }
    }

    // --- Segmented Wrapper Pieces (Foil & Paper Sleeve) ---
    const pieces: WrapperPiece[] = [];
    const wrapperTex = createWrapperTexture(product, factory);

    const wrapperRows = 4;
    const wrapperCols = 3;
    const pieceW = (barWidth + 0.1) / wrapperCols;
    const pieceH = (barHeight + 0.1) / wrapperRows;

    for (let r = 0; r < wrapperRows; r++) {
      for (let c = 0; c < wrapperCols; c++) {
        const x = (c - (wrapperCols - 1) / 2) * pieceW;
        const y = (r - (wrapperRows - 1) / 2) * pieceH;
        const z = barDepth * 0.58;

        // Dual-sided wrapper piece (outside printed wrapper, inside gold foil)
        const pieceGeo = new THREE.PlaneGeometry(pieceW * 0.96, pieceH * 0.96);

        // UV mapping so pieces form the complete texture
        const uvAttr = pieceGeo.attributes.uv;
        const uMin = c / wrapperCols;
        const uMax = (c + 1) / wrapperCols;
        const vMin = r / wrapperRows;
        const vMax = (r + 1) / wrapperRows;

        uvAttr.setXY(0, uMin, vMax);
        uvAttr.setXY(1, uMax, vMax);
        uvAttr.setXY(2, uMin, vMin);
        uvAttr.setXY(3, uMax, vMin);
        uvAttr.needsUpdate = true;

        const pieceMat = new THREE.MeshStandardMaterial({
          map: wrapperTex,
          roughness: 0.35,
          metalness: 0.4,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 1
        });

        const pieceMesh = new THREE.Mesh(pieceGeo, pieceMat);
        pieceMesh.position.set(x, y, z);
        pieceMesh.userData = { pieceIndex: pieces.length, isWrapper: true };
        barGroup.add(pieceMesh);

        pieces.push({
          mesh: pieceMesh,
          initialPos: pieceMesh.position.clone(),
          initialRot: pieceMesh.rotation.clone(),
          torn: false,
          velocity: new THREE.Vector3(),
          rotVelocity: new THREE.Vector3(),
          opacity: 1
        });
      }
    }

    wrapperPiecesRef.current = pieces;

    // M4: apply resumed non-wrapped state onto the freshly built pieces.
    if (fresh !== 'wrapped') {
      applyWrapVisual(fresh);
    }

    // 6. Raycasting & Interaction Handlers
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const tearPiece = (piece: WrapperPiece) => {
      if (piece.torn) return;
      piece.torn = true;
      playFoilTearSound();

      // Launch torn piece outward and downward with spin
      piece.velocity.set(
        (Math.random() - 0.5) * 0.08,
        -0.06 - Math.random() * 0.06,
        0.08 + Math.random() * 0.08
      );
      piece.rotVelocity.set(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2
      );

      // Check overall progress
      const tornCount = pieces.filter((p) => p.torn).length;
      const progress = tornCount / pieces.length;
      setUnwrapProgress(progress);

      if (progress >= 1) {
        setIsFullyUnwrapped(true);
        // M4: keep the persisted wrap state in sync with manual tearing.
        wrapStateRef.current = 'unwrapped';
        setWrapState('unwrapped');
        saveWrapState(toCommerce(product).sku, 'unwrapped');
        playChocolateSnapSound();
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#d4af37', '#f1c40f', '#5c3317', '#ffffff']
        });
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const currentX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const currentY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // If user is dragging across wrapper: tear pieces that intersect
      if (isInteractingRef.current && !isFullyUnwrapped) {
        mouse.x = currentX;
        mouse.y = currentY;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(barGroup.children);

        for (const hit of intersects) {
          const piece = pieces.find((p) => p.mesh === hit.object);
          if (piece && !piece.torn) {
            tearPiece(piece);
          }
        }
      }

      // If fully unwrapped: free 360 orbital rotation of chocolate bar
      if (isInteractingRef.current && isFullyUnwrapped && barGroup) {
        const deltaX = e.clientX - mousePreviousPos.current.x;
        const deltaY = e.clientY - mousePreviousPos.current.y;
        barGroup.rotation.y += deltaX * 0.012;
        barGroup.rotation.x += deltaY * 0.012;
      }

      mousePreviousPos.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerDown = (e: MouseEvent) => {
      isInteractingRef.current = true;
      mousePreviousPos.current = { x: e.clientX, y: e.clientY };

      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (!isFullyUnwrapped) {
        setIsDraggingToTear(true);
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(barGroup.children);
        for (const hit of intersects) {
          const piece = pieces.find((p) => p.mesh === hit.object);
          if (piece && !piece.torn) {
            tearPiece(piece);
          }
        }
      } else {
        setIsOrbiting(true);
      }
    };

    const handlePointerUp = () => {
      isInteractingRef.current = false;
      setIsDraggingToTear(false);
      setIsOrbiting(false);
    };

    // Reverse Scroll to Rewrap or Return
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < -25) {
        // Scrolling up in reverse: rewrap pieces or exit
        rewrapPieces();
      }
    };

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('wheel', handleWheel);

    // 7. Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Idle gentle float when not dragging
      if (!isInteractingRef.current && barGroup) {
        barGroup.position.y = Math.sin(elapsed * 1.4) * 0.06;
        if (!isFullyUnwrapped) {
          barGroup.rotation.y = Math.sin(elapsed * 0.6) * 0.08;
        }
      }

      // Animate torn pieces falling and fading
      pieces.forEach((piece) => {
        if (piece.torn && piece.opacity > 0) {
          piece.mesh.position.add(piece.velocity);
          piece.mesh.rotation.x += piece.rotVelocity.x;
          piece.mesh.rotation.y += piece.rotVelocity.y;
          piece.mesh.rotation.z += piece.rotVelocity.z;

          piece.opacity = Math.max(0, piece.opacity - 0.025);
          (piece.mesh.material as THREE.MeshStandardMaterial).opacity = piece.opacity;

          if (piece.opacity <= 0) {
            piece.mesh.visible = false;
          }
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('wheel', handleWheel);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [product, factory]);

  // Tear all wrapper pieces automatically
  const tearAll = () => {
    const pieces = wrapperPiecesRef.current;
    pieces.forEach((piece, idx) => {
      setTimeout(() => {
        if (!piece.torn) {
          piece.torn = true;
          playFoilTearSound();
          piece.velocity.set(
            (Math.random() - 0.5) * 0.09,
            -0.08 - Math.random() * 0.06,
            0.08 + Math.random() * 0.08
          );
          piece.rotVelocity.set(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
          );
          setUnwrapProgress((idx + 1) / pieces.length);
        }
      }, idx * 60);
    });

    setWrap('unwrapped');
    setTimeout(() => {
      setIsFullyUnwrapped(true);
      playChocolateSnapSound();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    }, pieces.length * 60 + 100);
  };

  // Re-wrap pieces back in reverse
  const rewrapPieces = () => {
    const pieces = wrapperPiecesRef.current;
    pieces.forEach((piece) => {
      piece.torn = false;
      piece.opacity = 1;
      piece.mesh.visible = true;
      piece.mesh.position.copy(piece.initialPos);
      piece.mesh.rotation.copy(piece.initialRot);
      (piece.mesh.material as THREE.MeshStandardMaterial).opacity = 1;
    });

    if (chocolateBarGroupRef.current) {
      chocolateBarGroupRef.current.rotation.set(0, 0, 0);
    }

    setUnwrapProgress(0);
    setIsFullyUnwrapped(false);
    setWrap('wrapped');
    playFoilTearSound();
  };

  // M4: intermediate state — pieces half-displaced with partial opacity.
  const applyPeeking = () => {
    applyWrapVisual('peeking');
    if (chocolateBarGroupRef.current) {
      chocolateBarGroupRef.current.rotation.set(0, 0, 0);
    }
    setWrap('peeking');
    playFoilTearSound();
  };

  // M4: cycle wrapped → peeking → unwrapped → wrapped.
  const advanceWrapState = () => {
    const next = nextWrapState(wrapStateRef.current);
    if (next === 'peeking') applyPeeking();
    else if (next === 'unwrapped') tearAll();
    else rewrapPieces();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-[#180b06] via-[#1f0e08] to-[#0d0503] select-none flex flex-col md:flex-row">
      
      {/* 3D Canvas Area */}
      <div className="relative flex-1 h-full w-full">
        <div
          ref={containerRef}
          className={`w-full h-full ${
            isFullyUnwrapped ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
          }`}
        />

        {/* Floating Controls & Interactive Instruction on top of canvas */}
        <div className="absolute top-20 left-6 right-6 z-20 flex items-center justify-between pointer-events-none">
          <button
            onClick={onBackToChamber}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1c100a]/90 backdrop-blur-md text-xs text-[#e5c158] hover:text-[#fff] hover:bg-[#2b170e] border border-[#d4af37]/30 transition-all pointer-events-auto cursor-pointer shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la Sala Real</span>
          </button>

          {/* Interactive State Badge */}
          <div className="pointer-events-auto">
            {!isFullyUnwrapped ? (
              wrapState === 'peeking' ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1c100a]/90 border border-[#f1c40f]/50 text-xs text-[#f1c40f] backdrop-blur-md shadow-lg">
                  <Layers className="w-3.5 h-3.5 animate-pulse text-[#f1c40f]" />
                  <span className="font-semibold">
                    Entreabierto · 50% — desliza para terminar de desenvolver
                  </span>
                </div>
              ) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1c100a]/90 border border-[#d4af37]/40 text-xs text-[#f1c40f] backdrop-blur-md shadow-lg">
                <Scissors className="w-3.5 h-3.5 animate-pulse text-[#d4af37]" />
                <span className="font-semibold">
                  {unwrapProgress === 0
                    ? 'Haz clic y desliza para romper el envoltorio'
                    : `Desempaquetando: ${Math.round(unwrapProgress * 100)}%`}
                </span>
              </div>
              )
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1c100a]/90 border border-[#22c55e]/40 text-xs text-[#4ade80] backdrop-blur-md shadow-lg">
                <Rotate3d className="w-3.5 h-3.5 animate-spin" />
                <span className="font-semibold">¡Desenvuelta! Arrastra con el ratón para rotar 360°</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Interactive Toolbar (Tear All / Rewrap / Reverse Guide) */}
        <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2 pointer-events-auto">
          {!isFullyUnwrapped ? (
            <button
              onClick={tearAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2e1910] hover:bg-[#3d2215] text-xs font-bold text-[#e5c158] border border-[#d4af37]/30 shadow-xl transition-all cursor-pointer"
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

          <button
            onClick={advanceWrapState}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c100a]/90 hover:bg-[#2b170e] text-xs font-bold text-[#f1c40f] border border-[#f1c40f]/30 shadow-xl transition-all cursor-pointer backdrop-blur-md"
            title="Avanzar al siguiente estado del envoltorio (envuelto → entreabierto → desenvuelto)"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Siguiente: {NEXT_LABEL[nextWrapState(wrapState)]}</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1c100a]/80 text-[11px] text-[#a08575] border border-[#d4af37]/15 backdrop-blur-sm">
            <span>Usa la rueda del ratón hacia atrás para re-envolver</span>
          </div>
        </div>

      </div>

      {/* Product Specification & Heritage Card (Side Panel) */}
      <motion.aside
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full md:w-[420px] lg:w-[460px] h-auto md:h-full bg-[#180c07]/95 backdrop-blur-2xl border-t md:border-t-0 md:border-l border-[#d4af37]/30 p-6 md:p-8 flex flex-col justify-between overflow-y-auto z-20 shadow-2xl shadow-black"
      >
        <div>
          {/* Badge & Factory */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase font-extrabold tracking-widest text-[#d4af37] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {factory.name}
            </span>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#d4af37]/15 text-[#f1c40f] border border-[#d4af37]/30">
              {product.badge || 'Edición Suprema'}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#fcf8f2] font-serif-luxury leading-tight mb-1">
            {product.name}
          </h2>

          <p className="text-xs text-[#bda393] italic font-serif-luxury mb-4">
            {product.subtitle}
          </p>

          {/* Description */}
          <p className="text-xs text-[#d7c4b7] leading-relaxed mb-5">
            {product.description}
          </p>

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
              <span className="text-xs font-bold text-[#fcf8f2] truncate block">{product.origin}</span>
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
        <div className="pt-4 border-t border-[#d4af37]/20 flex flex-col gap-2">
          {/* PR3 overlay add-to-cart (no RAF/scene changes) */}
          <button
            onClick={() => add(commerce.sku, commerce.stock)}
            disabled={commerce.stock <= 0}
            title={commerce.stock <= 0 ? 'Sin stock' : `Añadir ${product.name} al carrito`}
            className="w-full min-h-[44px] py-3 rounded-xl bg-[#2e1910] text-[#f1c40f] font-extrabold text-xs uppercase tracking-wider border border-[#d4af37]/40 hover:bg-[#3d2215] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center"
          >
            {commerce.stock <= 0 ? 'Sin stock' : `Añadir al carrito · Bs ${commerce.priceBOB.toFixed(2)}`}
          </button>
          {warning && <p role="alert" className="text-[11px] text-[#f0a6a6]">{warning}</p>}
          {onOpenAr && (
            <button
              onClick={onOpenAr}
              aria-label="Ver el producto en realidad aumentada"
              className="w-full min-h-[44px] py-3 rounded-xl bg-[#2e1910] text-[#f1c40f] font-extrabold text-xs uppercase tracking-wider border border-[#d4af37]/40 hover:bg-[#3d2215] active:scale-[0.98] transition-all cursor-pointer text-center"
            >
              Ver en realidad aumentada
            </button>
          )}
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
