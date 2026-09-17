import { create } from 'zustand';
import { User } from 'firebase/auth';

type Tier = 'free' | 'pro' | 'business';

interface AuthState {
  user: User | null;
  tier: Tier;
  /**
   * The tier users/{uid} last reported, as opposed to `tier`, which follows
   * the RevenueCat SDK live. null until a profile has been read. When the two
   * disagree, a webhook is late or lost and the server is reconciled
   * (see hooks/useRevenueCatSync.ts).
   */
  serverTier: Tier | null;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  setTier: (tier: Tier) => void;
  setServerTier: (serverTier: Tier | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tier: 'free',
  serverTier: null,
  isLoading: true,
  isInitialized: false,
  setUser: (user) => set({ user }),
  setTier: (tier) => set({ tier }),
  setServerTier: (serverTier) => set({ serverTier }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  signOut: () => set({ user: null, tier: 'free', serverTier: null }),
}));
