import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_THEME_MODE, THEME_STORE_VERSION, migrateThemeState } from '@/utils/themeDefault';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
  mode: ThemeMode;
  /** Picked in Settings — never overridden by a later change of default (utils/themeDefault). */
  chosen: boolean;
  _hasHydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: DEFAULT_THEME_MODE,
      chosen: false,
      _hasHydrated: false,
      setMode: (mode) => set({ mode, chosen: true }),
      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: THEME_STORE_VERSION,
      // Settings saved before 1.0.5 become dark once (utils/themeDefault).
      migrate: (persisted, version) => migrateThemeState(persisted, version) as unknown as ThemeState,
      partialize: (s) => ({ mode: s.mode, chosen: s.chosen }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
