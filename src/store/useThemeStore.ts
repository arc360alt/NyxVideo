import { create } from 'zustand';
import { applyTheme, getStoredTheme, type ThemeMode } from '../lib/theme';

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const initial = getStoredTheme();
applyTheme(initial);

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initial,
  toggle: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ mode: next });
  },
  setMode: (mode) => {
    applyTheme(mode);
    set({ mode });
  },
}));
