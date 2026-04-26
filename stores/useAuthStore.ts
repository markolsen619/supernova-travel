import { create } from 'zustand';
import { User } from 'firebase/auth';

type Tier = 'free' | 'pro' | 'business';

interface AuthState {
  user: User | null;
  tier: Tier;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  setTier: (tier: Tier) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tier: 'free',
  isLoading: true,
  isInitialized: false,
  setUser: (user) => set({ user }),
  setTier: (tier) => set({ tier }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  signOut: () => set({ user: null, tier: 'free' }),
}));
