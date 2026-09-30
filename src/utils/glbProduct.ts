import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
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

/**
 * Self-hosted Draco decoder (copied from `three/examples/jsm/libs/draco/`).
 * The optimized GLB scans in `public/` declare `KHR_draco_mesh_compression`,
 * so every three.js load needs this decoder; self-hosting keeps the 3D viewer
 * independent from any third-party CDN.
 */
export const DRACO_DECODER_PATH = '/draco/';

let sharedLoader: GLTFLoader | null = null;

/**
 * Shared GLTFLoader with the Draco decoder attached, created once per session
 * (DRACOLoader spawns its decode worker lazily on first compressed model).
 * Every caller that loads a shipped GLB must go through this factory — a plain
 * `new GLTFLoader()` cannot decode Draco and fails on the optimized scans.
 */
export function createGltfLoader(): GLTFLoader {
  if (!sharedLoader) {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    sharedLoader = new GLTFLoader();
    sharedLoader.setDRACOLoader(dracoLoader);
  }
  return sharedLoader;
}

/** Per-product load budget before giving up and keeping the fallback. */
export const PRODUCT_MODEL_TIMEOUT_MS = 8000;

/** Minimal loader surface; GLTFLoader satisfies this, mocks implement it. */
export interface ProductModelLoader {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
}

export interface LoadProductModelOptions {
  /** Real-world product height in cm (from ProductSpec.heightCm). */
  heightCm: number;
  /** Injectable loader for tests; defaults to the shared Draco-ready loader. */
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

/** Longest bounding-box edge of `object`, in its current scene units. */
export function measureLongestEdge(object: THREE.Object3D): number {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

/**
 * Uniformly scale `object` so its longest bounding-box edge matches `longestCm`
 * (real-world cm), then recenter it on its local origin. Used for the scanned
 * bar models, whose orientation is unknown, so the longest edge (15 cm) is the
 * safest anchor. Returns 1 (safe no-op) for degenerate input.
 */
export function applyRealWorldLongestEdge(object: THREE.Object3D, longestCm: number): number {
  const native = measureLongestEdge(object);
  if (!Number.isFinite(native) || native <= 0) return 1;
  if (!Number.isFinite(longestCm) || longestCm <= 0) return 1;
  const scale = longestCm / 100 / native;
  object.scale.multiplyScalar(scale);
  object.updateWorldMatrix(true, true);
  const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  object.position.sub(center);
  return scale;
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
    loader = createGltfLoader(),
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

export interface LoadedModel {
  object: THREE.Object3D;
  /** Uniform scale applied to map the model onto its real-world target size. */
  scale: number;
}

export interface LoadModelFromUrlOptions {
  /** Loader injection for tests; defaults to the shared Draco-ready loader. */
  loader?: ProductModelLoader;
  /** Load timeout budget in ms; defaults to PRODUCT_MODEL_TIMEOUT_MS. */
  timeoutMs?: number;
  /**
   * When set, the model is normalized so its longest bounding-box edge equals
   * this real-world size in cm. Omit to keep the authored scale (scale = 1).
   */
  targetLongestCm?: number;
}

/**
 * Load an already-resolved GLB url (percent-encoded URLs are allowed), optionally
 * normalizing it to a real-world longest edge. Resolves to null on ANY failure
 * (missing file, parse error, timeout) — never rejects. Used for the shared
 * scanned models, which live outside the per-sku `/models` convention.
 */
export async function loadModelFromUrl(
  url: string,
  options: LoadModelFromUrlOptions = {},
): Promise<LoadedModel | null> {
  const {
    loader = createGltfLoader(),
    timeoutMs = PRODUCT_MODEL_TIMEOUT_MS,
    targetLongestCm,
  } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loadPromise = loader.loadAsync(url);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out loading ${url}`)), timeoutMs);
    });
    const gltf = await Promise.race([loadPromise, timeoutPromise]);
    const object = gltf?.scene;
    if (!object) return null;
    const scale =
      typeof targetLongestCm === 'number' ? applyRealWorldLongestEdge(object, targetLongestCm) : 1;
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = true;
      }
    });
    return { object, scale };
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
