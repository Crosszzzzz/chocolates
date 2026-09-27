import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- M3 GLB loading infra ---
//
// Scale convention note: HeritageCorridorView declares its corridor as plain
// "3D units" (corridorLength = 65, camera eye height ~1.8) — no meters
// convention is discoverable there. This module therefore ASSUMES
// 1 scene unit = 1 meter: a loaded GLB is uniformly scaled so its
// bounding-box height equals heightCm / 100 scene units. If the art team
// later establishes a different unit convention, adjust the target height in
// computeModelScale only; callers stay untouched.
//
// Drop user-supplied assets at `public/models/<sku>.glb` (served as
// `/models/<sku>.glb`). No GLB files ship with the repo: every failure mode
// (missing file, parse error, timeout) resolves to null and the caller keeps
// the existing procedural MeshStandardMaterial mesh unchanged.

/** Static base path (under `public/`) for per-product GLB assets. */
export const PRODUCT_MODEL_BASE_PATH = '/models';

/** Per-product load budget before giving up and keeping the fallback. */
export const PRODUCT_MODEL_TIMEOUT_MS = 8000;

/** Minimal loader surface; GLTFLoader satisfies this, mocks implement it. */
export interface ProductModelLoader {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
}

export interface LoadProductModelOptions {
  /** Real-world product height in cm (from ProductSpec.heightCm). */
  heightCm: number;
  /** Injectable loader for tests; defaults to a real GLTFLoader. */
  loader?: ProductModelLoader;
  /** Override the `/models` base path (tests / alternate hosting). */
  basePath?: string;
  /** Override the load timeout budget in ms. */
  timeoutMs?: number;
}

/** Resolve the GLB URL for a product sku, e.g. `bars-foo` → `/models/bars-foo.glb`. */
export function resolveProductModelUrl(sku: string, basePath: string = PRODUCT_MODEL_BASE_PATH): string {
  return `${basePath}/${sku.trim()}.glb`;
}

/**
 * Uniform scale factor that maps a loaded bounding-box height (scene units)
 * onto the product's real height (heightCm → meters → scene units).
 * Returns 1 (safe no-op) for any degenerate input so callers never produce
 * NaN / Infinity / negative scales.
 */
export function computeModelScale(loadedHeightUnits: number, heightCm: number): number {
  if (!Number.isFinite(loadedHeightUnits) || loadedHeightUnits <= 0) return 1;
  if (!Number.isFinite(heightCm) || heightCm <= 0) return 1;
  return heightCm / 100 / loadedHeightUnits;
}

/**
 * Uniformly scale `object` so its bounding-box height matches `heightCm`,
 * then recenter it on its local origin so Y-spin staging stays stable.
 * Precondition: call while the object's parent chain is identity (i.e. before
 * adding it to a transformed group). Returns the applied scale factor.
 */
export function applyRealWorldScale(object: THREE.Object3D, heightCm: number): number {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = computeModelScale(size.y, heightCm);
  if (scale === 1) return 1;
  object.scale.multiplyScalar(scale);
  object.updateWorldMatrix(true, true);
  const recentered = new THREE.Box3().setFromObject(object);
  const center = recentered.getCenter(new THREE.Vector3());
  object.position.sub(center);
  return scale;
}

/**
 * Attempt to load `/models/<sku>.glb`, normalize it to real-world scale and
 * return it with embedded PBR materials untouched. Resolves to null on ANY
 * failure (missing file, parse error, timeout, degenerate geometry) — never
 * rejects, never breaks the scene. No new dependencies (three is installed).
 */
export async function loadProductModel(
  sku: string,
  options: LoadProductModelOptions
): Promise<THREE.Object3D | null> {
  const {
    heightCm,
    loader = new GLTFLoader(),
    basePath = PRODUCT_MODEL_BASE_PATH,
    timeoutMs = PRODUCT_MODEL_TIMEOUT_MS,
  } = options;
  const url = resolveProductModelUrl(sku, basePath);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loadPromise = loader.loadAsync(url);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out loading ${url}`)), timeoutMs);
    });
    const gltf = await Promise.race([loadPromise, timeoutPromise]);
    const object = gltf?.scene;
    if (!object) return null;
    applyRealWorldScale(object, heightCm);
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = true;
      }
    });
    return object;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
