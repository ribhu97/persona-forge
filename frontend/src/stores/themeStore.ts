import { create } from 'zustand';

export type Theme = 'light' | 'dark';

/** Read by the inline pre-paint script in `index.html` — keep the two in sync. */
export const THEME_STORAGE_KEY = 'personaforge-theme';

function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * A stored choice wins; a first visit follows the OS. Once the user has chosen, the OS is no
 * longer consulted — an explicit choice must not be overridden behind their back.
 */
export function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* storage unavailable — fall through to the OS preference */ }
  return prefersDark() ? 'dark' : 'light';
}

/** The `.dark` class lives on `<html>` so `body`'s surface and paper grid flip with it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: resolveInitialTheme(),

  setTheme: (theme) => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch { /* persistence is best-effort */ }
    set({ theme });
  },

  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
