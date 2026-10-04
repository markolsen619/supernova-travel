import { create } from 'zustand';
import type { TripSummary } from '@/utils/walletLink';

interface BookingBanner { kind: 'boarding_pass' | 'reservation'; id: string; trip: TripSummary; shownAt: number }
interface State { banner: BookingBanner | null; show: (b: Omit<BookingBanner, 'shownAt'>) => void; clear: () => void }

/** "Added to {trip}" after a save. Lives outside the add screen, which closes on save. */
export const useBookingBannerStore = create<State>((set) => ({
  banner: null,
  show: (banner) => set({ banner: { ...banner, shownAt: Date.now() } }),
  clear: () => set({ banner: null }),
}));
