/**
 * Dark/light theme (spec §3). The theme is the `data-theme` attribute on <html>; tokens.css does the rest.
 * Dark is the designed default. Only this UI preference is kept in localStorage — never tokens or user data (spec §6.2).
 */
export type Theme = 'dark' | 'light';

const KEY = 'wh_theme';
const listeners = new Set<(t: Theme) => void>();

const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light';

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : null;
  } catch {
    return null; // storage blocked (private mode) — fall back to the default
  }
}

export function getTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  return isTheme(attr) ? attr : (stored() ?? 'dark');
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore: the theme still applies for this page load
  }
  listeners.forEach((l) => l(theme));
}

export const toggleTheme = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');

export function onThemeChange(l: (t: Theme) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Call once before render. */
export function initTheme() {
  document.documentElement.dataset.theme = stored() ?? 'dark';
}
