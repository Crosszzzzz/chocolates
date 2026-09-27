import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WRAP_STORAGE_KEY,
  loadWrapState,
  nextWrapState,
  pieceTransform,
  saveWrapState,
} from './wrapper';

// In-memory localStorage stub (isolated per test, jsdom-independent).
function stubLocalStorage(initial?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  });
  return store;
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nextWrapState', () => {
  it('cycles wrapped → peeking → unwrapped → wrapped', () => {
    expect(nextWrapState('wrapped')).toBe('peeking');
    expect(nextWrapState('peeking')).toBe('unwrapped');
    expect(nextWrapState('unwrapped')).toBe('wrapped');
  });
});

describe('pieceTransform', () => {
  it('wrapped keeps pieces intact (no displacement/rotation, full opacity)', () => {
    for (let i = 0; i < 12; i++) {
      expect(pieceTransform('wrapped', i)).toEqual({ displacement: 0, rotation: 0, opacity: 1 });
    }
  });

  it('unwrapped displaces fully (torn pieces fly + fade)', () => {
    for (let i = 0; i < 12; i++) {
      expect(pieceTransform('unwrapped', i)).toEqual({ displacement: 1, rotation: 1, opacity: 0 });
    }
  });

  it('peeking half-displaces with partial opacity (~50% of full)', () => {
    for (let i = 0; i < 12; i++) {
      const t = pieceTransform('peeking', i);
      expect(t.displacement).toBeGreaterThanOrEqual(0.4);
      expect(t.displacement).toBeLessThanOrEqual(0.6);
      expect(t.rotation).toBeGreaterThanOrEqual(0.4);
      expect(t.rotation).toBeLessThanOrEqual(0.6);
      expect(t.opacity).toBeGreaterThan(0);
      expect(t.opacity).toBeLessThan(1);
    }
  });

  it('is deterministic per index and keeps all factors in [0, 1]', () => {
    for (let i = 0; i < 12; i++) {
      const a = pieceTransform('peeking', i);
      const b = pieceTransform('peeking', i);
      expect(a).toEqual(b);
      for (const v of [a.displacement, a.rotation, a.opacity]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('wrap persistence', () => {
  it('round-trips save → load per sku', () => {
    saveWrapState('sku-a', 'peeking');
    expect(loadWrapState('sku-a')).toBe('peeking');
    saveWrapState('sku-a', 'unwrapped');
    expect(loadWrapState('sku-a')).toBe('unwrapped');
  });

  it('keeps skus independent and merges under one storage key', () => {
    saveWrapState('sku-a', 'wrapped');
    saveWrapState('sku-b', 'peeking');
    expect(loadWrapState('sku-a')).toBe('wrapped');
    expect(loadWrapState('sku-b')).toBe('peeking');
    const raw = (localStorage as Storage).getItem(WRAP_STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual({ 'sku-a': 'wrapped', 'sku-b': 'peeking' });
  });

  it('returns null for unknown skus', () => {
    expect(loadWrapState('never-saved')).toBeNull();
  });

  it('returns null on corrupted JSON instead of throwing', () => {
    stubLocalStorage({ [WRAP_STORAGE_KEY]: 'not-json{{{' });
    expect(loadWrapState('sku-a')).toBeNull();
  });

  it('ignores invalid stored state values', () => {
    stubLocalStorage({ [WRAP_STORAGE_KEY]: JSON.stringify({ 'sku-a': 'melting' }) });
    expect(loadWrapState('sku-a')).toBeNull();
  });

  it('recovers when the stored root is not an object', () => {
    stubLocalStorage({ [WRAP_STORAGE_KEY]: JSON.stringify(['peeking']) });
    expect(loadWrapState('sku-a')).toBeNull();
    saveWrapState('sku-a', 'wrapped');
    expect(loadWrapState('sku-a')).toBe('wrapped');
  });
});
