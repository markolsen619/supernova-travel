import { create } from 'zustand';

interface UserProfile {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  location: string;
  followersCount: number;
  followingCount: number;
  createdAt: string;
}

interface UserState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  updateProfile: (partial: Partial<UserProfile>) => void;
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  updateProfile: (partial) =>
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...partial } : null,
    })),
}));
