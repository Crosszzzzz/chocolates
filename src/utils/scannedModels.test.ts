import { describe, expect, it } from 'vitest';
import {
  BAR_LONGEST_CM,
  BAR_SIZE_CM,
  SCANNED_MODELS,
  computeScannedModelScale,
  resolveProductScannedModels,
  resolveScannedModelUrl,
} from './scannedModels';

describe('resolveScannedModelUrl', () => {
  it('percent-encodes the spaces in the folder and file names', () => {
    expect(resolveScannedModelUrl('wrapped')).toBe(
      '/modelos%20escaneados/chocolate%20con%20envoltura.glb',
    );
    expect(resolveScannedModelUrl('unwrapped')).toBe(
      '/modelos%20escaneados/chocolate%20sin%20envoltorio.glb',
    );
  });

  it('honors a custom base path', () => {
    expect(resolveScannedModelUrl('wrapped', '/assets/scans')).toBe(
      '/assets/scans/chocolate%20con%20envoltura.glb',
    );
  });
});

describe('SCANNED_MODELS metadata', () => {
  it('marks only the heavy unwrapped scan as lazy', () => {
    expect(SCANNED_MODELS.wrapped.lazy).toBe(false);
    expect(SCANNED_MODELS.unwrapped.lazy).toBe(true);
    expect(SCANNED_MODELS.wrapped.bytes).toBeLessThan(SCANNED_MODELS.unwrapped.bytes);
  });
});

describe('resolveProductScannedModels', () => {
  it('maps bar products to the wrapped (AR) + unwrapped (3D) scans', () => {
    expect(resolveProductScannedModels({ type: 'bar' })).toEqual({
      ar: 'wrapped',
      detail3d: 'unwrapped',
    });
  });

  it('returns null for products with no scanned model', () => {
    expect(resolveProductScannedModels({ type: 'box' })).toBeNull();
    expect(resolveProductScannedModels({ type: 'truffle' })).toBeNull();
    expect(resolveProductScannedModels({})).toBeNull();
  });
});

describe('computeScannedModelScale', () => {
  it('maps a native longest edge onto the real 15 cm bar', () => {
    expect(computeScannedModelScale(1)).toBeCloseTo(0.15, 6);
    expect(computeScannedModelScale(2)).toBeCloseTo(0.075, 6);
  });

  it('is a safe no-op for degenerate input', () => {
    expect(computeScannedModelScale(0)).toBe(1);
    expect(computeScannedModelScale(-3)).toBe(1);
    expect(computeScannedModelScale(NaN)).toBe(1);
  });
});

describe('BAR size constants', () => {
  it('uses the measured 15.0 x 7.2 x 0.8 cm bar', () => {
    expect(BAR_SIZE_CM).toEqual({ lengthCm: 15.0, widthCm: 7.2, thicknessCm: 0.8 });
    expect(BAR_LONGEST_CM).toBe(15.0);
  });
});
