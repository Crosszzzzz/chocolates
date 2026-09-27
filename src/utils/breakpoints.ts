// Responsive reference widths (px) for the 360 / 768 / 1440 spec.
// - mobile:  < 768  (reference device: 360px wide phones)
// - tablet:  768–1439 (reference device: 768px tablets)
// - desktop: >= 1440 (reference device: 1440px desktops)

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const REFERENCE_WIDTHS = {
  mobile: 360,
  tablet: 768,
  desktop: 1440,
} as const;

/** First width (inclusive) that counts as tablet. */
export const TABLET_MIN_WIDTH = 768;
/** First width (inclusive) that counts as desktop. */
export const DESKTOP_MIN_WIDTH = 1440;

/**
 * Map a viewport width to a breakpoint bucket.
 * Non-finite or negative widths degrade to 'mobile' (never throws).
 */
export function breakpointFor(width: number): Breakpoint {
  if (!Number.isFinite(width) || width < TABLET_MIN_WIDTH) return 'mobile';
  if (width < DESKTOP_MIN_WIDTH) return 'tablet';
  return 'desktop';
}
