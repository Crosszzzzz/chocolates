import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearIslandFacadeCache,
  getIslandFacadeUrl,
  isIslandFacadeLoaded,
  preloadIslandFacade,
} from './islandFacade';

let constructed = 0;

// jsdom has no network: setting src resolves load/error on the microtask queue.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  get src(): string {
    return this._src;
  }
  set src(value: string) {
    constructed += 1;
    this._src = value;
    queueMicrotask(() => {
      if (value.includes('missing')) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    });
  }
}

beforeEach(() => {
  constructed = 0;
  clearIslandFacadeCache();
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getIslandFacadeUrl', () => {
  it('resolves the conventional per-island jpg path', () => {
    expect(getIslandFacadeUrl('para-ti')).toBe('/images/islands/para-ti.jpg');
  });
});

describe('preloadIslandFacade', () => {
  it('resolves true once and caches per id (single Image)', async () => {
    const first = preloadIslandFacade('para-ti');
    const second = preloadIslandFacade('para-ti');
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(isIslandFacadeLoaded('para-ti')).toBe(true);
    expect(constructed).toBe(1);
  });

  it('resolves false on error without throwing (procedural fallback stays)', async () => {
    await expect(preloadIslandFacade('missing-island')).resolves.toBe(false);
    expect(isIslandFacadeLoaded('missing-island')).toBe(false);
  });
});
