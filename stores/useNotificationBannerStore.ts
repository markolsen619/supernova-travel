import { create } from 'zustand';

/** The notification you just tapped, repeated at the top of the screen it opened (components/NotificationArrivalBanner). */
interface NotificationBannerState {
  banner: { title: string; body: string; at: number } | null;
  show: (title: string, body: string) => void;
  clear: () => void;
}

export const useNotificationBannerStore = create<NotificationBannerState>((set) => ({
  banner: null,
  show: (title, body) => set({ banner: { title, body, at: Date.now() } }),
  clear: () => set({ banner: null }),
}));
