import { create } from 'zustand';

/**
 * The signed-in user's own moderation choices: who they blocked and what they
 * reported. Loaded once per session (services/moderation.ts), updated
 * optimistically when they act, and read by every list that shows other
 * people's content (hooks/useModeration.ts).
 */
interface ModerationState {
  blockedUids: string[];
  hiddenKeys: string[];
  setAll: (state: { blockedUids: string[]; hiddenKeys: string[] }) => void;
  addBlocked: (uid: string) => void;
  removeBlocked: (uid: string) => void;
  addHidden: (key: string) => void;
  reset: () => void;
}

export const useModerationStore = create<ModerationState>((set) => ({
  blockedUids: [],
  hiddenKeys: [],
  setAll: ({ blockedUids, hiddenKeys }) => set({ blockedUids, hiddenKeys }),
  addBlocked: (uid) =>
    set((s) => (s.blockedUids.includes(uid) ? s : { blockedUids: [...s.blockedUids, uid] })),
  removeBlocked: (uid) => set((s) => ({ blockedUids: s.blockedUids.filter((u) => u !== uid) })),
  addHidden: (key) =>
    set((s) => (s.hiddenKeys.includes(key) ? s : { hiddenKeys: [...s.hiddenKeys, key] })),
  reset: () => set({ blockedUids: [], hiddenKeys: [] }),
}));
