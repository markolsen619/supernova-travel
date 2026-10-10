import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RoutePaletteId } from '@/constants/routePalettes';
import type { Basemap } from '@/utils/mapLook';

/** The traveler's chosen route colours — a per-device preference, like the theme. */
interface MapStyleState {
  paletteId: RoutePaletteId;
  setPaletteId: (id: RoutePaletteId) => void;
  /** The trip map's basemap: the 3D map (default) or satellite imagery (utils/mapLook). */
  basemap: Basemap;
  setBasemap: (b: Basemap) => void;
}

export const useMapStyleStore = create<MapStyleState>()(
  persist(
    (set) => ({
      paletteId: 'aurora',
      setPaletteId: (paletteId) => set({ paletteId }),
      basemap: 'map',
      setBasemap: (basemap) => set({ basemap }),
    }),
    { name: 'map-style-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
