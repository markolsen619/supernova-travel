import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RoutePaletteId } from '@/constants/routePalettes';

/** The traveler's chosen route colours — a per-device preference, like the theme. */
interface MapStyleState {
  paletteId: RoutePaletteId;
  setPaletteId: (id: RoutePaletteId) => void;
}

export const useMapStyleStore = create<MapStyleState>()(
  persist(
    (set) => ({
      paletteId: 'aurora',
      setPaletteId: (paletteId) => set({ paletteId }),
    }),
    { name: 'map-style-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
