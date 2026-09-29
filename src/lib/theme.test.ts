import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  parseTheme,
} from './theme';

describe('theme helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
  });

  it('defaults to dark', () => {
    expect(DEFAULT_THEME).toBe('dark');
  });

  it('parses only "light" as light, everything else as dark', () => {
    expect(parseTheme('light')).toBe('light');
    for (const raw of ['dark', '', null, undefined, 42, 'LIGHT', ' light ']) {
      expect(parseTheme(raw)).toBe('dark');
    }
  });

  it('reads the persisted theme, defaulting to dark', () => {
    expect(getStoredTheme()).toBe('dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getStoredTheme()).toBe('light');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(getStoredTheme()).toBe('dark');
  });

  it('applies the theme class to <html> and persists it', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('never leaves both theme classes at once (toggle round-trip)', () => {
    applyTheme('dark');
    applyTheme('light');
    applyTheme('dark');
    const classes = Array.from(document.documentElement.classList);
    expect(classes.filter((c) => c === 'dark' || c === 'light')).toEqual(['dark']);
  });
});
