import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ProductSpec } from '../types/chocolate';

/** Default model paths served from Vite's publicDir (/modelos/...). */
const DEFAULT_WRAPPED_GLB = '/modelos/hersheys_chocolate_bar.glb';
const DEFAULT_UNWRAPPED_GLB = '/modelos/hersheys_chocolate_bar_unwrapped.glb';
const DEFAULT_WRAPPED_USDZ = '/modelos/Hersheys_Chocolate_Bar.usdz';
const DEFAULT_UNWRAPPED_USDZ = '/modelos/Hersheys_Chocolate_Bar_Unwrapped.usdz';

export interface ModelPaths {
  glb: string;
  glbUnwrapped: string;
  usdz: string;
  usdzUnwrapped: string;
}

/**
 * Resolve GLB/USDZ paths for a product. Products may override via
 * modelGlb/modelUsdz; otherwise the shared Hershey's twins are used
 * (including box products, for visual coherence).
 */
export function getModelPaths(product: ProductSpec): ModelPaths {
  return {
    glb: product.modelGlb ?? DEFAULT_WRAPPED_GLB,
    glbUnwrapped: DEFAULT_UNWRAPPED_GLB,
    usdz: product.modelUsdz ?? DEFAULT_WRAPPED_USDZ,
    usdzUnwrapped: DEFAULT_UNWRAPPED_USDZ
  };
}

export interface DimensionsMeters {
  /** Longest side in meters (e.g. 0.162). */
  length: number;
  width: number;
  height: number;
}

/**
 * Parse a "16.2 x 7.6 x 0.9 cm" style dimension string into meters.
 * Returns a sane ~16cm bar fallback when the string cannot be parsed.
 */
export function parseDimensionsToMeters(dimensions: string): DimensionsMeters {
  const fallback: DimensionsMeters = { length: 0.16, width: 0.075, height: 0.01 };
  if (!dimensions) return fallback;

  const nums = dimensions
    .toLowerCase()
    .split('x')
    .map((part) => parseFloat(part.replace(/[^0-9.]/g, '')))
    .filter((n) => Number.isFinite(n));

  if (nums.length < 3) return fallback;

  let [a, b, c] = nums;
  const unitIsCm = /cm/i.test(dimensions);
  const unitIsMm = /mm/i.test(dimensions);
  if (unitIsMm) {
    a /= 10;
    b /= 10;
    c /= 10;
  } else if (!unitIsCm) {
    // Heuristic: bare numbers > 1 are almost certainly centimeters here.
    if (a > 1 || b > 1 || c > 1) {
      a /= 100;
      b /= 100;
      c /= 100;
    }
  } else {
    a /= 100;
    b /= 100;
    c /= 100;
  }

  const sorted = [a, b, c].sort((x, y) => y - x);
  return { length: sorted[0], width: sorted[1], height: sorted[2] };
}

// Cache GLTF loads so every pedestal/view reuses one decoded scene.
const gltfCache = new Map<string, Promise<GLTF>>();

export function loadGltfCached(url: string): Promise<GLTF> {
  let promise = gltfCache.get(url);
  if (!promise) {
    const loader = new GLTFLoader();
    promise = loader.loadAsync(url).catch((err) => {
      gltfCache.delete(url);
      throw err;
    });
    gltfCache.set(url, promise);
  }
  return promise;
}

/**
 * Normalize a bar model: orient it, scale its longest side to
 * `targetLongest`, and re-center it on the local origin.
 *
 * The root's parent chain must be identity (world == local) when called —
 * clone into a temporary identity group first when in doubt.
 *
 * orientation:
 *  - 'upright': longest axis -> Y (pedestal display), thinnest -> Z
 *  - 'flat':    thinnest axis -> Y (lying on an AR surface)
 */
export function normalizeBarModel(
  root: THREE.Object3D,
  targetLongest: number,
  orientation: 'upright' | 'flat'
): THREE.Vector3 {
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  let size = box.getSize(new THREE.Vector3());

  const maxIdx = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  const minIdx = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;

  if (orientation === 'flat') {
    // Thinnest axis -> Y so the bar lies on the surface...
    if (minIdx === 0) root.rotateZ(Math.PI / 2); // X -> Y
    else if (minIdx === 2) root.rotateX(-Math.PI / 2); // Z -> Y
    // ...and longest axis -> X (the slide-out direction for the unwrap sleeve).
    box.setFromObject(root);
    size = box.getSize(new THREE.Vector3());
    if (size.z > size.x) root.rotateY(Math.PI / 2);
  } else {
    // Longest axis -> Y, then thinnest -> Z (faces the camera).
    if (maxIdx === 0) root.rotateZ(Math.PI / 2); // X -> Y
    else if (maxIdx === 2) root.rotateX(Math.PI / 2); // Z -> Y

    box.setFromObject(root);
    size = box.getSize(new THREE.Vector3());
    const minIdx2 = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
    if (minIdx2 === 0) root.rotateY(Math.PI / 2); // X -> Z
  }

  box.setFromObject(root);
  size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest > 0) {
    root.scale.multiplyScalar(targetLongest / longest);
  }

  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);

  box.setFromObject(root);
  return box.getSize(new THREE.Vector3());
}

/** Dispose geometries/materials of an object tree (best-effort). */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

/**
 * Clamp runaway metalness on a loaded GLB clone so foil/chocolate react to
 * IBL (scene.environment) instead of rendering black, and make sure the
 * environment actually lights every PBR material. Keeps the original colors
 * (including near-black foil) untouched — light/env fix the shading.
 */
export function applyPbrEnvFix(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] })
      .material;
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (typeof std.metalness === 'number' && std.metalness > 0.6) {
        std.metalness = 0.6;
      }
      if ('envMapIntensity' in std) {
        std.envMapIntensity = 1.1;
      }
      mat.needsUpdate = true;
    }
  });
}
