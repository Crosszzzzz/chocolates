// M4: 3-state wrapper machine (wrapped → peeking → unwrapped → wrapped).
// Pure helpers + per-sku localStorage persistence so a future AR view can
// resume the wrap state. No three.js / DOM imports here (unit-testable).

export type WrapState = 'wrapped' | 'peeking' | 'unwrapped';

export const WRAP_STATES: readonly WrapState[] = ['wrapped', 'peeking', 'unwrapped'] as const;

/** Per-piece transform factors in [0, 1]. displacement/rotation scale a
 *  canonical offset; opacity is applied directly to the piece material. */
export interface PieceTransform {
  displacement: number;
  rotation: number;
  opacity: number;
}

export const WRAP_STORAGE_KEY = 'chocolates.wrap.v1';

const PEEKING_DISPLACEMENT = 0.5;
const PEEKING_ROTATION = 0.5;
const PEEKING_OPACITY = 0.75;

/** Cycle wrapped → peeking → unwrapped → wrapped. */
export function nextWrapState(state: WrapState): WrapState {
  switch (state) {
    case 'wrapped':
      return 'peeking';
    case 'peeking':
      return 'unwrapped';
    case 'unwrapped':
      return 'wrapped';
  }
}

/**
 * Transform factors for piece `index` in a given state.
 * - wrapped: intact (no displacement/rotation, full opacity).
 * - peeking: half-displaced (~50% of full displacement, partial opacity)
 *   with a small deterministic per-piece stagger so the foil looks naturally
 *   lifted instead of uniformly shifted.
 * - unwrapped: fully displaced (torn pieces fly + fade via velocities).
 */
export function pieceTransform(state: WrapState, index: number): PieceTransform {
  switch (state) {
    case 'wrapped':
      return { displacement: 0, rotation: 0, opacity: 1 };
    case 'unwrapped':
      return { displacement: 1, rotation: 1, opacity: 0 };
    case 'peeking': {
      const stagger = ((index % 3) - 1) * 0.05; // -0.05 | 0 | +0.05 per column
      const rowLift = (Math.floor(index / 3) % 2 === 0 ? 1 : -1) * 0.03;
      return {
        displacement: clamp01(PEEKING_DISPLACEMENT + stagger),
        rotation: clamp01(PEEKING_ROTATION + rowLift),
        opacity: PEEKING_OPACITY,
      };
    }
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function isWrapState(value: unknown): value is WrapState {
  return value === 'wrapped' || value === 'peeking' || value === 'unwrapped';
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStore(): Record<string, WrapState> {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(WRAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, WrapState> = {};
    for (const [sku, state] of Object.entries(parsed as Record<string, unknown>)) {
      if (isWrapState(state)) out[sku] = state;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persisted wrap state for `sku`, or null when never saved / corrupted. */
export function loadWrapState(sku: string): WrapState | null {
  const state = readStore()[sku];
  return state !== undefined && isWrapState(state) ? state : null;
}

/** Persist `state` for `sku` (merges with other skus, never throws). */
export function saveWrapState(sku: string, state: WrapState): void {
  const store = storage();
  if (!store) return;
  try {
    const all = readStore();
    all[sku] = state;
    store.setItem(WRAP_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full / unavailable: AR resume degrades to default state.
  }
}
