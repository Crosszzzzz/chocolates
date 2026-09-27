import { describe, expect, it, vi } from 'vitest';
import {
  AR_REFERENCE_SCALE_M,
  HOLD_TO_PLACE_MS,
  checkUsdzAvailable,
  isImmersiveArSupported,
  resolveUsdzUrl,
} from './arExperience';

describe('AR_REFERENCE_SCALE_M', () => {
  it('is the 0.162 m product-anchor reference scale', () => {
    expect(AR_REFERENCE_SCALE_M).toBe(0.162);
  });
});

describe('HOLD_TO_PLACE_MS', () => {
  it('requires a 1 s hold to place', () => {
    expect(HOLD_TO_PLACE_MS).toBe(1000);
  });
});

describe('resolveUsdzUrl', () => {
  it('maps a sku to its per-product USDZ under /models', () => {
    expect(resolveUsdzUrl('parati-70-silvestre')).toBe('/models/parati-70-silvestre.usdz');
  });

  it('trims whitespace and honors a custom base path', () => {
    expect(resolveUsdzUrl('  sku-a  ')).toBe('/models/sku-a.usdz');
    expect(resolveUsdzUrl('sku-a', '/cdn/ar')).toBe('/cdn/ar/sku-a.usdz');
  });
});

describe('isImmersiveArSupported', () => {
  it('resolves false when navigator has no xr (desktop guard)', async () => {
    await expect(isImmersiveArSupported({} as never)).resolves.toBe(false);
    await expect(isImmersiveArSupported(null)).resolves.toBe(false);
  });

  it('resolves false when isSessionSupported is missing', async () => {
    await expect(isImmersiveArSupported({ xr: {} })).resolves.toBe(false);
  });

  it('asks for immersive-ar and forwards a true verdict', async () => {
    const isSessionSupported = vi.fn().mockResolvedValue(true);
    await expect(isImmersiveArSupported({ xr: { isSessionSupported } })).resolves.toBe(true);
    expect(isSessionSupported).toHaveBeenCalledWith('immersive-ar');
  });

  it('forwards a false verdict', async () => {
    const isSessionSupported = vi.fn().mockResolvedValue(false);
    await expect(isImmersiveArSupported({ xr: { isSessionSupported } })).resolves.toBe(false);
  });

  it('never throws when detection rejects', async () => {
    const isSessionSupported = vi.fn().mockRejectedValue(new Error('NotSupportedError'));
    await expect(isImmersiveArSupported({ xr: { isSessionSupported } })).resolves.toBe(false);
  });

  it('never throws when detection throws synchronously', async () => {
    const isSessionSupported = vi.fn(() => {
      throw new Error('no xr');
    });
    await expect(isImmersiveArSupported({ xr: { isSessionSupported } })).resolves.toBe(false);
  });
});

describe('checkUsdzAvailable', () => {
  it('resolves true on an ok HEAD response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await expect(checkUsdzAvailable('/models/sku-a.usdz', fetchFn)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('/models/sku-a.usdz', { method: 'HEAD' });
  });

  it('resolves false on a 404 HEAD response (asset absent)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });
    await expect(checkUsdzAvailable('/models/missing.usdz', fetchFn)).resolves.toBe(false);
  });

  it('never rejects on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(checkUsdzAvailable('/models/sku-a.usdz', fetchFn)).resolves.toBe(false);
  });
});
