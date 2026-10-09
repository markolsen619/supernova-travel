import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Which trips you've opened or folded in Wallet → By trip — per device (utils/walletByTrip isSectionOpen). */
interface WalletSectionsState {
  open: Record<string, boolean>;
  setOpen: (tripId: string, open: boolean) => void;
}

export const useWalletSectionsStore = create<WalletSectionsState>()(
  persist(
    (set) => ({
      open: {},
      setOpen: (tripId, open) => set((s) => ({ open: { ...s.open, [tripId]: open } })),
    }),
    { name: 'wallet-sections-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
