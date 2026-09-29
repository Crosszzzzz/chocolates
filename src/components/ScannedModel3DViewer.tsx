import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Package, PackageOpen, Rotate3d, X } from 'lucide-react';
import { loadModelFromUrl } from '../utils/glbProduct';
import { BAR_LONGEST_CM, toggleScannedVariant, type ScannedVariant } from '../utils/scannedModels';
import { useTheme } from '../contexts/ThemeContext';

export interface Model3DVariantUrls {
  wrappedUrl: string;
  unwrappedUrl: string;
}

interface ScannedModel3DViewerProps {
  /** Initial (legacy single-model) percent-encoded GLB url. */
  modelUrl: string;
  /** Product name shown in the header. */
  title: string;
  /**
   * When set, a visible "Con envoltorio / Sin envoltorio" switch swaps the
   * model live. The heavy unwrapped scan stays lazy: it only loads after the
   * user picks it, behind a spinner.
   */
  variantUrls?: Model3DVariantUrls | null;
  /** Which variant shows first when `variantUrls` is set. */
  initialVariant?: ScannedVariant;
  onClose: () => void;
}

/**
 * Orbitable 3D viewer for the scanned bar. Mounted only when the user asks
 * for it, so no file is fetched on page load. A spinner covers each load
 * (the unwrapped scan is ~18 MB); any failure shows a friendly note instead
 * of a blank canvas.
 */
export const ScannedModel3DViewer: React.FC<ScannedModel3DViewerProps> = ({
  modelUrl,
  title,
  variantUrls,
  initialVariant = 'unwrapped',
  onClose,
}) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [variant, setVariant] = useState<ScannedVariant>(initialVariant);

  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const hemiRef = useRef<THREE.HemisphereLight | null>(null);
  const keyRef = useRef<THREE.DirectionalLight | null>(null);
  const rimRef = useRef<THREE.DirectionalLight | null>(null);
  const fillRef = useRef<THREE.DirectionalLight | null>(null);

  const activeUrl = variantUrls
    ? variant === 'wrapped'
      ? variantUrls.wrappedUrl
      : variantUrls.unwrappedUrl
    : modelUrl;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    setStatus('loading');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.001,
      100,
    );
    camera.position.set(0, 0.09, 0.42);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Bright catalogue look: filmic tone mapping lifts the dark scan
    // without touching the real-world scale (15 x 7.2 x 0.8 cm).
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // Hemisphere gradient (warm sky / cocoa ground) keeps dark GLB albedo
    // readable; ambient + warm key + gold rim + cool front fill sculpt it.
    const hemi = new THREE.HemisphereLight(0xfff6e6, 0x5c3a22, 1.1);
    scene.add(hemi);
    hemiRef.current = hemi;
    const ambient = new THREE.AmbientLight(0xfff6e8, 2.0);
    scene.add(ambient);
    ambientRef.current = ambient;
    const key = new THREE.DirectionalLight(0xfff1d6, 3.0);
    key.position.set(0.4, 0.7, 0.6);
    scene.add(key);
    keyRef.current = key;
    const rim = new THREE.DirectionalLight(0xffd98a, 2.2);
    rim.position.set(-0.5, 0.3, -0.6);
    scene.add(rim);
    rimRef.current = rim;
    const fill = new THREE.DirectionalLight(0xffe9c4, 1.4);
    fill.position.set(-0.6, 0.2, 0.7);
    scene.add(fill);
    fillRef.current = fill;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.1;
    controls.maxDistance = 1.2;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;

    let model: THREE.Object3D | null = null;
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    void loadModelFromUrl(activeUrl, { targetLongestCm: BAR_LONGEST_CM, timeoutMs: 30000 }).then(
      (loaded) => {
        if (!loaded) {
          if (!disposed) setStatus('error');
          return;
        }
        if (disposed) {
          loaded.object.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) mesh.geometry.dispose();
          });
          return;
        }
        model = loaded.object;
        // Dark scans crush to black under neutral PBR: cap metallic look,
        // keep chocolate roughness natural and add a faint warm emissive
        // lift so the bar reads on both themes. Scale untouched.
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => {
            const std = mat as unknown as THREE.MeshStandardMaterial;
            if (typeof std.roughness === 'number') std.roughness = Math.min(std.roughness, 0.75);
            if (typeof std.metalness === 'number') std.metalness = Math.min(std.metalness, 0.3);
            if (std.emissive instanceof THREE.Color) {
              std.emissive.set(0x1a0d05);
              std.emissiveIntensity = 0.25;
            }
            std.needsUpdate = true;
          });
        });
        scene.add(model);
        setStatus('ready');
        animate();
      },
    );

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      if (model) {
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const material = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(material)) material.forEach((m) => m.dispose());
            else material?.dispose();
          }
        });
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [activeUrl]);

  useEffect(() => {
    const light = theme === 'light';
    if (hemiRef.current) {
      hemiRef.current.color.set(light ? 0xfffaf2 : 0xfff6e6);
      hemiRef.current.groundColor.set(light ? 0x8a6a45 : 0x5c3a22);
      hemiRef.current.intensity = light ? 1.2 : 1.1;
    }
    if (ambientRef.current) {
      ambientRef.current.color.set(light ? 0xfffaf2 : 0xfff6e8);
      ambientRef.current.intensity = light ? 2.1 : 2.0;
    }
    if (keyRef.current) keyRef.current.intensity = light ? 3.2 : 3.0;
    if (rimRef.current) rimRef.current.intensity = light ? 2.0 : 2.2;
    if (fillRef.current) fillRef.current.intensity = light ? 1.5 : 1.4;
  }, [theme]);

  const subtitle = variantUrls
    ? variant === 'wrapped'
      ? 'Vista 3D · con envoltorio'
      : 'Vista 3D · sin envoltorio'
    : 'Vista 3D · sin envoltorio';

  // Escape closes the 3D modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista 3D de ${title}`}
    >
      <div
        className="absolute inset-0 bg-[#2b1a12]/60 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto flex max-h-[100dvh] w-full max-w-full flex-col overflow-hidden overflow-x-hidden rounded-t-3xl border border-[#d4af37]/30 bg-[#fffdf8] shadow-2xl shadow-black/60 sm:max-h-[92vh] sm:max-w-2xl sm:rounded-3xl dark:bg-[#1c100a]">
        <div className="flex items-start justify-between gap-3 border-b border-[#d4af37]/20 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Rotate3d className="mt-0.5 h-5 w-5 shrink-0 text-[#d4af37]" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#d4af37]">
                {subtitle}
              </p>
              <h3 className="text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista 3D"
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#d4af37]/30 p-2 text-[#8a6216] transition-all hover:bg-[#f3e7d3] dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {variantUrls && (
          <div className="px-4 pt-4 sm:px-5">
            <div
              role="group"
              aria-label="Cambiar presentación del modelo"
              className="grid grid-cols-2 gap-1 rounded-2xl border border-[#d4af37]/30 bg-[#f3e7d3]/60 p-1 dark:bg-[#25130b]/70"
            >
              <button
                type="button"
                aria-pressed={variant === 'wrapped'}
                onClick={() => setVariant('wrapped')}
                className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                  variant === 'wrapped'
                    ? 'bg-gradient-to-r from-[#d4af37] via-[#c0392b] to-[#8a6216] text-white shadow-md shadow-[#c0392b]/30'
                    : 'text-[#8a6216] hover:bg-[#efe0c6] dark:text-[#e5c158] dark:hover:bg-[#2e1910]'
                }`}
              >
                <Package className="h-4 w-4" aria-hidden="true" />
                Con envoltorio
              </button>
              <button
                type="button"
                aria-pressed={variant === 'unwrapped'}
                onClick={() => setVariant(toggleScannedVariant(variant))}
                className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                  variant === 'unwrapped'
                    ? 'bg-gradient-to-r from-[#4a7c2e] via-[#5c3317] to-[#2e4a1a] text-white shadow-md shadow-[#4a7c2e]/30'
                    : 'text-[#8a6216] hover:bg-[#efe0c6] dark:text-[#e5c158] dark:hover:bg-[#2e1910]'
                }`}
              >
                <PackageOpen className="h-4 w-4" aria-hidden="true" />
                Sin envoltorio
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          <div
            ref={containerRef}
            className="h-[clamp(300px,52dvh,420px)] w-full bg-[radial-gradient(ellipse_at_center,#fff8ea_0%,#f7e8c8_45%,#e8c98a_100%)] dark:bg-[radial-gradient(ellipse_at_center,#4a2a14_0%,#241209_55%,#0e0503_100%)]"
          />
          {/* Gold radial glow so the dark bar reads as silhouette-free */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.28)_0%,transparent_62%)]"
          />
          {status === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#faf6ef]/85 text-sm text-[#5c4433] dark:bg-[#180b06]/85 dark:text-[#e6d5c3]"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4af37] border-t-transparent" />
              <span>
                {activeUrl === variantUrls?.unwrappedUrl
                  ? 'Cargando modelo detallado (18 MB)…'
                  : 'Cargando modelo…'}
              </span>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#5c4433] dark:text-[#e6d5c3]">
              No pudimos cargar el modelo en 3D. Revisá tu conexión e intentá nuevamente.
            </div>
          )}
        </div>

        <p className="p-4 text-[11px] text-[#7a5c48] dark:text-[#8e786b] sm:px-5">
          Arrastrá para orbitar y pellizcá o usá la rueda para acercar. Escala real 15 × 7.2 × 0.8 cm.
        </p>
        </div>
      </div>
    </div>
  );
};
