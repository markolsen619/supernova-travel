import { create } from 'zustand';

/** Feed video sound: muted until someone taps the speaker, then held while they scroll. Not persisted — every launch starts muted. */
export const useFeedSoundStore = create<{ muted: boolean; toggleMuted: () => void }>((set) => ({
  muted: true,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
}));
