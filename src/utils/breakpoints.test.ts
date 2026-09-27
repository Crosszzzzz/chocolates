import { describe, expect, it } from 'vitest';
import {
  DESKTOP_MIN_WIDTH,
  REFERENCE_WIDTHS,
  TABLET_MIN_WIDTH,
  breakpointFor,
} from './breakpoints';

describe('breakpointFor', () => {
  it('maps the 360 reference width (and small phones) to mobile', () => {
    expect(breakpointFor(360)).toBe('mobile');
    expect(breakpointFor(320)).toBe('mobile');
    expect(breakpointFor(375)).toBe('mobile');
  });

  it('stays mobile just below the 768 tablet cutoff', () => {
    expect(breakpointFor(767)).toBe('mobile');
  });

  it('maps the 768 reference width (and tablets) to tablet', () => {
    expect(breakpointFor(768)).toBe('tablet');
    expect(breakpointFor(1024)).toBe('tablet');
  });

  it('stays tablet just below the 1440 desktop cutoff', () => {
    expect(breakpointFor(1439)).toBe('tablet');
  });

  it('maps the 1440 reference width (and wider) to desktop', () => {
    expect(breakpointFor(1440)).toBe('desktop');
    expect(breakpointFor(1920)).toBe('desktop');
  });

  it('degrades to mobile for non-finite or negative widths instead of throwing', () => {
    expect(breakpointFor(Number.NaN)).toBe('mobile');
    expect(breakpointFor(Number.POSITIVE_INFINITY)).toBe('mobile');
    expect(breakpointFor(-1)).toBe('mobile');
  });

  it('exposes the 360/768/1440 reference widths and cutoffs', () => {
    expect(REFERENCE_WIDTHS).toEqual({ mobile: 360, tablet: 768, desktop: 1440 });
    expect(TABLET_MIN_WIDTH).toBe(768);
    expect(DESKTOP_MIN_WIDTH).toBe(1440);
  });
});
