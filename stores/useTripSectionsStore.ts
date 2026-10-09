import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Which cities you've opened or folded on a multi-city trip, keyed `${tripId}:${cityIndex}` — per device. */
interface TripSectionsState {
  open: Record<string, boolean>;
  setOpen: (key: string, open: boolean) => void;
}

export const useTripSectionsStore = create<TripSectionsState>()(
  persist(
    (set) => ({
      open: {},
      setOpen: (key, open) => set((s) => ({ open: { ...s.open, [key]: open } })),
    }),
    { name: 'trip-sections-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
