import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Rotate3d, X } from 'lucide-react';
import { loadModelFromUrl } from '../utils/glbProduct';
import { BAR_LONGEST_CM } from '../utils/scannedModels';
import { useTheme } from '../contexts/ThemeContext';

interface ScannedModel3DViewerProps {
  /** Percent-encoded GLB url (the heavy unwrapped/details scan). */
  modelUrl: string;
  /** Product name shown in the header. */
  title: string;
  onClose: () => void;
}

/**
 * Orbitable 3D viewer for the heavy unwrapped scan (~18 MB). Mounted only when
 * the user asks for it, so the file is never fetched on page load. A spinner
 * covers the load; any failure shows a friendly note instead of a blank canvas.
 */
export const ScannedModel3DViewer: React.FC<ScannedModel3DViewerProps> = ({
  modelUrl,
  title,
  onClose,
}) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const keyRef = useRef<THREE.DirectionalLight | null>(null);
  const rimRef = useRef<THREE.DirectionalLight | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

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
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xfff6e8, 1.1);
    scene.add(ambient);
    ambientRef.current = ambient;
    const key = new THREE.DirectionalLight(0xfff4e0, 2.0);
    key.position.set(0.4, 0.7, 0.6);
    scene.add(key);
    keyRef.current = key;
    const rim = new THREE.DirectionalLight(0xffd98a, 1.2);
    rim.position.set(-0.5, 0.3, -0.6);
    scene.add(rim);
    rimRef.current = rim;

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

    void loadModelFromUrl(modelUrl, { targetLongestCm: BAR_LONGEST_CM, timeoutMs: 30000 }).then(
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
  }, [modelUrl]);

  useEffect(() => {
    const light = theme === 'light';
    if (ambientRef.current) {
      ambientRef.current.color.set(light ? 0xfffaf2 : 0xfff6e8);
      ambientRef.current.intensity = light ? 1.25 : 1.1;
    }
    if (keyRef.current) keyRef.current.intensity = light ? 2.2 : 2.0;
    if (rimRef.current) rimRef.current.intensity = light ? 1.0 : 1.2;
  }, [theme]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-[#2b1a12]/60 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-[#d4af37]/30 bg-[#fffdf8] dark:bg-[#1c100a] shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3 border-b border-[#d4af37]/20 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Rotate3d className="mt-0.5 h-5 w-5 shrink-0 text-[#d4af37]" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#d4af37]">
                Vista 3D · sin envoltorio
              </p>
              <h3 className="text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista 3D"
            className="shrink-0 rounded-lg border border-[#d4af37]/30 p-2 text-[#8a6216] transition-all hover:bg-[#f3e7d3] dark:text-[#e5c158] dark:hover:bg-[#2b170e]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="relative">
          <div
            ref={containerRef}
            className="h-[360px] w-full bg-gradient-to-b from-[#faf6ef] to-[#eeddc0] dark:from-[#180b06] dark:to-[#0d0503]"
          />
          {status === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#faf6ef]/85 text-sm text-[#5c4433] dark:bg-[#180b06]/85 dark:text-[#e6d5c3]"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4af37] border-t-transparent" />
              <span>Cargando modelo detallado (18 MB)…</span>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#5c4433] dark:text-[#e6d5c3]">
              No pudimos cargar el modelo en 3D. Intentá nuevamente más tarde.
            </div>
          )}
        </div>

        <p className="p-4 text-[11px] text-[#7a5c48] dark:text-[#8e786b] sm:px-5">
          Arrastrá para orbitar y pellizcá o usá la rueda para acercar. Escala real 15 × 7.2 × 0.8 cm.
        </p>
      </div>
    </div>
  );
};
