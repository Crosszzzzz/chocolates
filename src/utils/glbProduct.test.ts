import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  computeModelScale,
  loadProductModel,
  resolveProductModelUrl,
} from './glbProduct';

describe('resolveProductModelUrl', () => {
  it('maps a sku to its per-product GLB under /models', () => {
    expect(resolveProductModelUrl('parati-70-silvestre')).toBe('/models/parati-70-silvestre.glb');
  });
});

describe('computeModelScale', () => {
  it('maps bbox height onto real height in cm, guarding degenerate input', () => {
    // 2-unit tall model, 16.5 cm real bar → target 0.165 units (1 unit = 1 m).
    expect(computeModelScale(2, 16.5)).toBeCloseTo(0.0825, 6);
    // Degenerate input must be a safe no-op, never NaN/Infinity/negative.
    expect(computeModelScale(0, 16.5)).toBe(1);
    expect(computeModelScale(2, 0)).toBe(1);
    expect(computeModelScale(NaN, 16.5)).toBe(1);
  });
});

describe('loadProductModel', () => {
  it('returns null when the loader fails (missing file / parse error)', async () => {
    const loader = { loadAsync: vi.fn().mockRejectedValue(new Error('404')) };
    await expect(
      loadProductModel('no-such-sku', { heightCm: 16.5, loader })
    ).resolves.toBeNull();
    expect(loader.loadAsync).toHaveBeenCalledWith('/models/no-such-sku.glb');
  });

  it('returns null on timeout instead of hanging the scene', async () => {
    const loader = { loadAsync: vi.fn().mockReturnValue(new Promise(() => {})) };
    await expect(
      loadProductModel('slow-sku', { heightCm: 16.5, loader, timeoutMs: 10 })
    ).resolves.toBeNull();
  });

  it('returns the scene normalized to its real-world height', async () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
    const loader = { loadAsync: vi.fn().mockResolvedValue({ scene }) };
    const model = await loadProductModel('parati-70-silvestre', { heightCm: 16.5, loader });
    expect(model).not.toBeNull();
    const size = new THREE.Box3().setFromObject(model!).getSize(new THREE.Vector3());
    expect(size.y).toBeCloseTo(0.165, 6);
  });
});
