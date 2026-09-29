/**
 * Global theme helpers (dark default, light brand adaptation).
 *
 * The React provider lives in `src/contexts/ThemeContext.tsx`; this module
 * holds the pure, easily unit-tested pieces: storage key, parsing, reading
 * the persisted value and applying the theme class to the document.
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'ruta-chocolate-theme';

export const DEFAULT_THEME: Theme = 'dark';

/** Coerce any stored/unknown value to a valid theme (dark wins). */
export function parseTheme(raw: unknown): Theme {
  return raw === 'light' ? 'light' : 'dark';
}

function readStorage(): string | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Read the persisted theme; defaults to dark on first visit or on error. */
export function getStoredTheme(): Theme {
  return parseTheme(readStorage());
}

/**
 * Apply the theme to the document: toggles `dark`/`light` on
 * `<html>` (Tailwind v4 class-based dark variant), sets `color-scheme`
 * for native controls/scrollbars and persists the choice.
 */
export function applyTheme(theme: Theme, target?: Document): void {
  const doc = target ?? (typeof document !== 'undefined' ? document : undefined);
  if (doc?.documentElement) {
    doc.documentElement.classList.remove('dark', 'light');
    doc.documentElement.classList.add(theme);
    doc.documentElement.style.colorScheme = theme;
  }
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Private mode / blocked storage: theme still works in-memory.
  }
}
