import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, Quote, ChevronLeft } from 'lucide-react';
import { ChocolateFactory, HistoryMilestone } from '../types/chocolate';
import { playPedestalHum } from '../utils/audio';
import { useTheme } from '../contexts/ThemeContext';

interface HeritageCorridorViewProps {
  factory: ChocolateFactory;
  onReturnToArchipelago: () => void;
}

export const HeritageCorridorView: React.FC<HeritageCorridorViewProps> = ({
  factory,
  onReturnToArchipelago
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [currentMilestoneIndex, setCurrentMilestoneIndex] = useState<number>(0);
  const [doorOpen, setDoorOpen] = useState<boolean>(false);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const doorLeftRef = useRef<THREE.Mesh | null>(null);
  const doorRightRef = useRef<THREE.Mesh | null>(null);
  const sconcesRef = useRef<THREE.PointLight[]>([]);

  const { theme } = useTheme();

  // Live theme handles (populated by the setup effect, read by [theme]).
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const hemisphereLightRef = useRef<THREE.HemisphereLight | null>(null);

  // Smooth scroll target
  const targetZ = useRef<number>(5);
  const currentZ = useRef<number>(5);
  const corridorLength = 65; // Length of corridor in 3D units

  // Generate Canvas Texture for Wall Painting / Plaque
  const createPlaqueTexture = (milestone: HistoryMilestone, index: number): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Parchment / Dark Chocolate background
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 768);
    bgGrad.addColorStop(0, '#24140c');
    bgGrad.addColorStop(1, '#150a06');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 768);

    // Ornate Gold border
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 14;
    ctx.strokeRect(24, 24, 976, 720);

    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, 944, 688);

    // Header topic
    ctx.fillStyle = '#e5c158';
    ctx.font = 'bold 36px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ARCHIVO HISTÓRICO • ${milestone.year}`, 512, 110);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px "Playfair Display", serif';
    ctx.fillText(milestone.title, 512, 190);

    // Archival topic badge
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(362, 225, 300, 40);
    ctx.fillStyle = '#1a0f08';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(milestone.archivalTopic.toUpperCase(), 512, 253);

    // Description text (wrapped)
    ctx.fillStyle = '#e6d5c3';
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';

    const words = milestone.description.split(' ');
    let line = '';
    let y = 340;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > 860 && n > 0) {
        ctx.fillText(line, 512, y);
        line = words[n] + ' ';
        y += 48;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 512, y);

    // Quote if available
    if (milestone.quote) {
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'italic 30px "Playfair Display", serif';
      ctx.fillText(milestone.quote, 512, y + 80);
    }

    // Emblem seal
    ctx.beginPath();
    ctx.arc(512, 650, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#d4af37';
    ctx.fill();
    ctx.fillStyle = '#1c100a';
    ctx.font = 'bold 22px "Cinzel", serif';
    ctx.fillText('SUCRE', 512, 658);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x2a160d, 0.022);

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      120
    );
    camera.position.set(0, 1.8, targetZ.current);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Lights (warm premium night: lifted base so corridor reads like islands)
    const ambientLight = new THREE.AmbientLight(0x9a6a45, 2.0);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const hemisphereLight = new THREE.HemisphereLight(0xffe0b3, 0x2a140a, 0.7);
    scene.add(hemisphereLight);
    hemisphereLightRef.current = hemisphereLight;

    // 5. Corridor Geometry Construction
    const corridorWidth = 6.2;
    const corridorHeight = 5.2;

    // Floor (Polished terracotta & dark marble tiles)
    const floorGeo = new THREE.PlaneGeometry(corridorWidth, corridorLength, 12, 40);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x241209,
      roughness: 0.25,
      metalness: 0.3
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, 0, -corridorLength / 2 + 6);
    scene.add(floor);

    // Ceiling with colonial wooden vigas (beams)
    const ceilGeo = new THREE.PlaneGeometry(corridorWidth, corridorLength);
    ceilGeo.rotateX(Math.PI / 2);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x180c06, roughness: 0.9 });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.position.set(0, corridorHeight, -corridorLength / 2 + 6);
    scene.add(ceiling);

    // Cross beams across the ceiling
    for (let b = 0; b < corridorLength; b += 4.5) {
      const beamGeo = new THREE.BoxGeometry(corridorWidth + 0.2, 0.3, 0.4);
      const beamMat = new THREE.MeshStandardMaterial({ color: 0x3d1d0c, roughness: 0.9 });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0, corridorHeight - 0.15, 6 - b);
      scene.add(beam);
    }

    // Left & Right Walls
    const wallGeo = new THREE.PlaneGeometry(corridorLength, corridorHeight);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2c170d,
      roughness: 0.75,
      side: THREE.DoubleSide
    });

    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-corridorWidth / 2, corridorHeight / 2, -corridorLength / 2 + 6);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(corridorWidth / 2, corridorHeight / 2, -corridorLength / 2 + 6);
    scene.add(rightWall);

    // Sconces along the hallway with warm flickering light
    const sconces: THREE.PointLight[] = [];
    for (let zPos = 4; zPos > -corridorLength + 8; zPos -= 7.5) {
      // Left sconce
      const lightLeft = new THREE.PointLight(0xffb84d, 3.0, 14);
      lightLeft.position.set(-corridorWidth / 2 + 0.4, 2.7, zPos);
      scene.add(lightLeft);
      sconces.push(lightLeft);

      const lampLeft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.35, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 })
      );
      lampLeft.position.copy(lightLeft.position);
      scene.add(lampLeft);

      // Right sconce
      const lightRight = new THREE.PointLight(0xffb84d, 3.0, 14);
      lightRight.position.set(corridorWidth / 2 - 0.4, 2.7, zPos);
      scene.add(lightRight);
      sconces.push(lightRight);

      const lampRight = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.35, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 })
      );
      lampRight.position.copy(lightRight.position);
      scene.add(lampRight);
    }
    sconcesRef.current = sconces;

    // 6. Wall Paintings & Plaques for Factory Milestones
    const milestones = factory.historyMilestones;
    const milestoneZPositions: number[] = [];

    milestones.forEach((m, idx) => {
      const zDistance = 0 - idx * 12.5;
      milestoneZPositions.push(zDistance);
      const isLeft = idx % 2 === 0;

      // Picture frame canvas texture
      const texture = createPlaqueTexture(m, idx);
      const plaqueMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.35,
        metalness: 0.1
      });

      const frameGeo = new THREE.BoxGeometry(2.9, 2.1, 0.12);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xb8860b,
        metalness: 0.85,
        roughness: 0.3
      });
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);

      const canvasPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(2.7, 1.9),
        plaqueMat
      );
      canvasPlane.position.z = 0.07;
      frameMesh.add(canvasPlane);

      // Position along left or right wall
      if (isLeft) {
        frameMesh.position.set(-corridorWidth / 2 + 0.1, 2.2, zDistance);
        frameMesh.rotation.y = Math.PI / 2;
      } else {
        frameMesh.position.set(corridorWidth / 2 - 0.1, 2.2, zDistance);
        frameMesh.rotation.y = -Math.PI / 2;
      }
      scene.add(frameMesh);

      // Dedicated spotlight on the painting
      const spot = new THREE.SpotLight(0xfff3c4, 3.5, 12, Math.PI / 5, 0.4);
      spot.position.set(0, 3.8, zDistance);
      spot.target = frameMesh;
      scene.add(spot);
      scene.add(spot.target);
    });

    // 7. Grand Archway & Vault Doors at End of Corridor
    const doorZ = -corridorLength + 10;

    // Archway portal frame
    const archFrameGeo = new THREE.BoxGeometry(corridorWidth + 0.3, corridorHeight + 0.2, 0.8);
    const archFrameMat = new THREE.MeshStandardMaterial({
      color: 0x42200f,
      roughness: 0.6,
      metalness: 0.3
    });
    const archFrame = new THREE.Mesh(archFrameGeo, archFrameMat);
    archFrame.position.set(0, corridorHeight / 2, doorZ);
    scene.add(archFrame);

    // Left Door
    const doorGeo = new THREE.BoxGeometry(1.6, 3.8, 0.15);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x5a2d12,
      roughness: 0.4,
      metalness: 0.5
    });

    const doorLeft = new THREE.Mesh(doorGeo, doorMat);
    doorLeft.position.set(-0.8, 1.9, doorZ + 0.1);
    scene.add(doorLeft);
    doorLeftRef.current = doorLeft;

    // Right Door
    const doorRight = new THREE.Mesh(doorGeo, doorMat);
    doorRight.position.set(0.8, 1.9, doorZ + 0.1);
    scene.add(doorRight);
    doorRightRef.current = doorRight;

    // Golden Radiant Light pouring from behind the door
    const vaultLight = new THREE.PointLight(0xffd700, 6, 30);
    vaultLight.position.set(0, 2, doorZ - 3);
    scene.add(vaultLight);

    // Golden Seal above the door
    const seal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.9, roughness: 0.2 })
    );
    seal.rotation.x = Math.PI / 2;
    seal.position.set(0, 4.1, doorZ + 0.45);
    scene.add(seal);

    // 8. Scroll & Wheel Listeners
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * 0.02;
      const minZ = doorZ + 3; // Stop right at the door
      const maxZ = 6;
      targetZ.current = THREE.MathUtils.clamp(targetZ.current - delta, minZ, maxZ);
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const touchStartY = { current: 0 };
    const handleTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      const delta = (touchStartY.current - currentY) * 0.06;
      touchStartY.current = currentY;
      const minZ = doorZ + 3;
      const maxZ = 6;
      targetZ.current = THREE.MathUtils.clamp(targetZ.current - delta, minZ, maxZ);
    };

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove);

    // 9. Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth camera translation down the corridor
      currentZ.current = THREE.MathUtils.lerp(currentZ.current, targetZ.current, 0.08);
      camera.position.z = currentZ.current;

      // Subtle natural camera sway
      camera.position.y = 1.8 + Math.sin(currentZ.current * 1.5) * 0.04;
      camera.rotation.z = Math.sin(currentZ.current * 0.8) * 0.008;

      // Subtle light flicker in sconces
      sconces.forEach((light, i) => {
        light.intensity = 3.0 + Math.sin(elapsed * 4 + i) * 0.35;
      });

      // Calculate progress (0% to 100%)
      const totalDistance = 6 - (doorZ + 3);
      const traveled = 6 - currentZ.current;
      const prog = THREE.MathUtils.clamp(traveled / totalDistance, 0, 1);
      setScrollProgress(prog);

      // Determine active milestone based on camera Z
      let activeIndex = 0;
      for (let i = 0; i < milestoneZPositions.length; i++) {
        if (Math.abs(currentZ.current - milestoneZPositions[i]) < 5.5) {
          activeIndex = i;
          break;
        }
      }
      setCurrentMilestoneIndex(activeIndex);

      // Open grand vault door when approaching the end (> 88% progress)
      if (prog > 0.88) {
        setDoorOpen(true);
        if (doorLeftRef.current && doorRightRef.current) {
          doorLeftRef.current.rotation.y = THREE.MathUtils.lerp(
            doorLeftRef.current.rotation.y,
            -Math.PI * 0.45,
            0.05
          );
          doorRightRef.current.rotation.y = THREE.MathUtils.lerp(
            doorRightRef.current.rotation.y,
            Math.PI * 0.45,
            0.05
          );
        }
      } else {
        setDoorOpen(false);
        if (doorLeftRef.current && doorRightRef.current) {
          doorLeftRef.current.rotation.y = THREE.MathUtils.lerp(
            doorLeftRef.current.rotation.y,
            0,
            0.08
          );
          doorRightRef.current.rotation.y = THREE.MathUtils.lerp(
            doorRightRef.current.rotation.y,
            0,
            0.08
          );
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [factory]);

  // Live theme sync (no scene rebuild): fog, clear color, exposure and base
  // lights follow the global theme. Dark restores the original night values.
  // Note: this renderer is opaque (alpha: false), so light mode also needs
  // an explicit cream scene background instead of the default black clear.
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    const light = theme === 'light';
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(light ? 0xf0e2c8 : 0x2a160d);
    }
    scene.background = light ? new THREE.Color(0xf5ead6) : null;
    renderer.toneMappingExposure = light ? 1.0 : 1.15;
    if (ambientLightRef.current) {
      ambientLightRef.current.color.set(light ? 0xfff2e0 : 0x9a6a45);
      ambientLightRef.current.intensity = light ? 2.2 : 2.0;
    }
    if (hemisphereLightRef.current) {
      hemisphereLightRef.current.color.set(light ? 0xfff6e6 : 0xffe0b3);
      hemisphereLightRef.current.groundColor.set(light ? 0xd9c49a : 0x2a140a);
    }
  }, [theme]);

  // Jump to next or previous milestone
  const navigateMilestone = (direction: 'next' | 'prev') => {
    playPedestalHum();
    const milestones = factory.historyMilestones;
    let nextIndex = direction === 'next' ? currentMilestoneIndex + 1 : currentMilestoneIndex - 1;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= milestones.length) {
      // Jump towards the door
      targetZ.current = -corridorLength + 13;
      return;
    }
    targetZ.current = 0 - nextIndex * 12.5;
  };

  const jumpToVault = () => {
    playPedestalHum();
    targetZ.current = -corridorLength + 13;
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#faf6ef] dark:bg-[#150b07] select-none">
      
      {/* 3D Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0 cursor-ns-resize" />

      {/* Atmospheric vignette */}
      <div className="absolute inset-0 pointer-events-none bg-radial-[at_50%_50%] from-transparent via-[#d9c49a]/20 dark:via-[#140a05]/20 to-[#c9a86a]/30 dark:to-[#0c0502]/65" />

      {/* Active Milestone Archival Focus HUD Card */}
      <div className="absolute top-36 left-6 z-20 max-w-sm hidden md:block pointer-events-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentMilestoneIndex}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-[#fffdf8]/90 dark:bg-[#1c100a]/90 backdrop-blur-xl border border-[#d4af37]/35 rounded-2xl p-5 shadow-2xl shadow-black/80"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#d4af37]/20 text-[#8a6216] dark:text-[#f1c40f] border border-[#d4af37]/40">
                {factory.historyMilestones[currentMilestoneIndex]?.year}
              </span>
              <span className="text-[11px] text-[#7a5c48] dark:text-[#bda393] uppercase tracking-wider font-semibold">
                Hito {currentMilestoneIndex + 1} de {factory.historyMilestones.length}
              </span>
            </div>

            <h4 className="text-lg font-bold text-[#2b1a12] dark:text-[#fcf8f2] font-serif-luxury leading-tight mb-2">
              {factory.historyMilestones[currentMilestoneIndex]?.title}
            </h4>

            <p className="text-xs text-[#5c4433] dark:text-[#d7c4b7] leading-relaxed mb-3">
              {factory.historyMilestones[currentMilestoneIndex]?.description}
            </p>

            {factory.historyMilestones[currentMilestoneIndex]?.quote && (
              <div className="p-2.5 rounded-xl bg-[#efe0c6] dark:bg-[#2e1910] border-l-2 border-[#d4af37] text-xs text-[#8a6216] dark:text-[#e5c158] italic font-serif-luxury flex items-start gap-2">
                <Quote className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#d4af37]" />
                <span>{factory.historyMilestones[currentMilestoneIndex]?.quote}</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating Scroll Guide at Bottom Center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3 pointer-events-auto">

        {scrollProgress < 0.85 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-2 bg-[#fffdf8]/85 dark:bg-[#1c100a]/85 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-[#d4af37]/30 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateMilestone('prev')}
                disabled={currentMilestoneIndex === 0}
                className="p-1.5 rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] text-[#d4af37] disabled:opacity-40 cursor-pointer"
                title="Hito anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="text-center">
                <span className="text-xs font-semibold text-[#2b1a12] dark:text-[#fcf8f2] flex items-center gap-1.5 justify-center">
                  <span>Desliza para caminar por el pasillo</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#d4af37] animate-bounce" />
                </span>
                <div className="w-48 h-1.5 bg-[#efe0c6] dark:bg-[#3a1d12] rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#d4af37] to-[#8a6216] dark:to-[#e5c158] transition-all duration-150"
                    style={{ width: `${Math.round(scrollProgress * 100)}%` }}
                  />
                </div>
              </div>

              <button
                onClick={() => navigateMilestone('next')}
                className="p-1.5 rounded-lg bg-[#efe0c6] dark:bg-[#2e1910] hover:bg-[#e2cda4] hover:dark:bg-[#3d2215] text-[#d4af37] cursor-pointer"
                title="Siguiente hito"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={jumpToVault}
              className="text-[11px] text-[#8a6216] dark:text-[#e5c158] hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Avanzar directo al final del pasillo</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </motion.div>
        )}

        {/* Gold chamber CTA removed per visual bug report: the corridor phase is
            retired (flow goes diving -> chamber) and this component is not
            mounted. Chamber entry stays via the island dive flow. */}

      </div>

      {/* Back button to the floating islands (icon only) */}
      <div className="absolute top-20 left-6 z-20 hidden sm:block pointer-events-auto">
        <button
          onClick={onReturnToArchipelago}
          aria-label="Back to archipelago"
          title="Back to archipelago"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#fffdf8]/80 dark:bg-[#1c100a]/80 backdrop-blur-md text-[#8a6216] dark:text-[#e5c158] hover:text-[#2b1a12] hover:dark:text-[#fff] hover:bg-[#f3e7d3] hover:dark:bg-[#2b170e] border border-[#d4af37]/25 transition-all cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
};
