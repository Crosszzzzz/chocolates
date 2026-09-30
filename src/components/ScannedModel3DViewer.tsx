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
  /** Real-world longest edge in cm the scan is normalized to. */
  targetLongestCm?: number;
  /** Kept for API compatibility (currently unused). */
  dimensions?: string | null;
  onClose: () => void;
}

// Display factor for the 3D preview: the model is framed at 60% of the
// default fill so it matches the smaller AR placement and the showcase
// thumbnail. The auto-fit below derives the camera distance from the
// bounding radius, which cancels any raw model scaling, so the factor is
// applied to the framing margin (not to `targetLongestCm`) to be visible.
const AR_SCALE_FACTOR = 0.6;

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
  targetLongestCm = BAR_LONGEST_CM,
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
    renderer.toneMappingExposure = 0.95;
    container.appendChild(renderer.domElement);

    // Hemisphere gradient (warm sky / cocoa ground) keeps dark GLB albedo
    // readable; ambient + warm key + gold rim + cool front fill sculpt it.
    const hemi = new THREE.HemisphereLight(0xfff6e6, 0x5c3a22, 0.85);
    scene.add(hemi);
    hemiRef.current = hemi;
    const ambient = new THREE.AmbientLight(0xfff6e8, 1.5);
    scene.add(ambient);
    ambientRef.current = ambient;
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
    key.position.set(0.4, 0.7, 0.6);
    scene.add(key);
    keyRef.current = key;
    const rim = new THREE.DirectionalLight(0xffd98a, 1.6);
    rim.position.set(-0.5, 0.3, -0.6);
    scene.add(rim);
    rimRef.current = rim;
    const fill = new THREE.DirectionalLight(0xffe9c4, 1.0);
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

    void loadModelFromUrl(activeUrl, { targetLongestCm, timeoutMs: 30000 }).then(
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
              std.emissiveIntensity = 0.18;
            }
            std.needsUpdate = true;
          });
        });
        scene.add(model);
        // Frame the model to fill ~70-80% of the viewport height regardless
        // of its real-world size (a 5 cm box and a 15 cm bar normalize to
        // very different scene radii). Exact-fit distance for the bounding
        // sphere is radius / sin(fov/2); the 1.25x margin keeps the silhouette
        // inside the frame on orbit while filling the view without zoom.
        // Dividing that margin by AR_SCALE_FACTOR renders the model 40%
        // smaller, matching the AR placement.
        // controls.target follows the sphere center so small products don't
        // sit tiny in the middle. min/maxDistance scale with the fit so
        // close-ups stay allowed but the default already fills the view.
        {
          const box = new THREE.Box3().setFromObject(model);
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          const radius = Math.max(sphere.radius, 1e-4);
          const fitDistance =
            (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) *
            (1.25 / AR_SCALE_FACTOR);
          const viewDir = new THREE.Vector3(0, 0.21, 1).normalize();
          camera.position.copy(sphere.center).addScaledVector(viewDir, fitDistance);
          camera.near = Math.max(fitDistance / 100, 1e-4);
          camera.far = fitDistance * 100;
          camera.updateProjectionMatrix();
          controls.target.copy(sphere.center);
          controls.minDistance = fitDistance * 0.35;
          controls.maxDistance = fitDistance * 3;
          controls.update();
        }
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
  }, [activeUrl, targetLongestCm]);

  useEffect(() => {
    const light = theme === 'light';
    if (hemiRef.current) {
      hemiRef.current.color.set(light ? 0xfffaf2 : 0xfff6e6);
      hemiRef.current.groundColor.set(light ? 0x8a6a45 : 0x5c3a22);
      hemiRef.current.intensity = light ? 0.9 : 0.85;
    }
    if (ambientRef.current) {
      ambientRef.current.color.set(light ? 0xfffaf2 : 0xfff6e8);
      ambientRef.current.intensity = light ? 1.6 : 1.5;
    }
    if (keyRef.current) keyRef.current.intensity = light ? 2.4 : 2.2;
    if (rimRef.current) rimRef.current.intensity = light ? 1.5 : 1.6;
    if (fillRef.current) fillRef.current.intensity = light ? 1.1 : 1.0;
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
      className="fixed inset-0 z-40 flex items-end justify-center px-0 pb-0 pt-[80px] sm:items-center sm:px-6 sm:pb-4 sm:pt-[104px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista 3D de ${title}`}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto flex h-[calc(100dvh-72px-1rem)] max-h-[calc(100dvh-72px-1rem)] w-full max-w-full flex-col overflow-hidden overflow-x-hidden rounded-t-3xl border border-[#d4af37]/30 bg-[#fffdf8] shadow-2xl shadow-black/60 sm:h-[calc(100dvh-6rem-1rem)] sm:max-h-[calc(100dvh-6rem-1rem)] sm:max-w-2xl sm:rounded-3xl dark:bg-[#1c100a]">
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
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

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={containerRef}
            className="min-h-[300px] w-full flex-1 bg-[radial-gradient(ellipse_at_center,#fbf3df_0%,#f1e2c0_45%,#dfc084_100%)] dark:bg-[radial-gradient(ellipse_at_center,#38200f_0%,#1d0f07_55%,#0e0503_100%)]"
          />
          {/* Soft gold glow so the dark bar reads without silhouette washout */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.15)_0%,transparent_50%)]"
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
        </div>
      </div>
    </div>
  );
};
