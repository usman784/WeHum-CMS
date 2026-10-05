import { useSyncExternalStore } from 'react';
import { getTheme, onThemeChange, setTheme, toggleTheme } from '../lib/theme';

export function useTheme() {
  const theme = useSyncExternalStore(onThemeChange, getTheme);
  return { theme, setTheme, toggleTheme };
}
