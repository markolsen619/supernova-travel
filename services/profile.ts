import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type NewUserProfileInput = {
  fullName: string;
  /** Empty string when a username claim lost a race; set later from Edit profile. */
  username: string;
};

/**
 * The users/{uid} document shape for a brand-new account. Pure and
 * timestamp-free so it can be asserted on — createUserProfile adds createdAt.
 *
 * Sole definition of this shape. Email sign-up and complete-profile both go
 * through it; divergence here silently produces malformed accounts.
 */
export function buildUserProfile({ fullName, username }: NewUserProfileInput) {
  return {
    fullName: fullName.trim(),
    username,
    avatarUrl: null,
    bio: '',
    location: '',
    tier: 'free',
    followersCount: 0,
    followingCount: 0,
    settings: { theme: 'dark', notificationsEnabled: true, privacy: 'public' },
    usage: { weeklyAiTrips: 0, weeklyResetAt: null },
  };
}

export async function createUserProfile(uid: string, input: NewUserProfileInput): Promise<void> {
  // merge: true — if this ever runs against an existing doc (e.g. the
  // complete-profile idempotency guard races a concurrent write), a plain
  // setDoc would REPLACE it, wiping avatarUrl/bio/location/follower counts/
  // expoPushTokens. firestore.rules permits this for free-tier users, so
  // without merge it would fail silently with no error to catch.
  await setDoc(
    doc(db, 'users', uid),
    {
      ...buildUserProfile(input),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}
