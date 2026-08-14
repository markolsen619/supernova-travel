import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db } from '@/services/firebase';
import { configureRevenueCat } from '@/services/revenuecat';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';

export async function registerPushToken(uid: string) {
  if (Platform.OS === 'web') return;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  // Store token on the user document for Cloud Function flight alerts
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const existing: string[] = snap.data().expoPushTokens ?? [];
    if (!existing.includes(token)) {
      const { updateDoc, arrayUnion } = await import('firebase/firestore');
      await updateDoc(userRef, { expoPushTokens: arrayUnion(token) });
    }
  }
}

/**
 * Everything that must happen once a signed-in user's profile document is
 * known to exist. Called from two places that CANNOT be collapsed into one:
 * the auth listener (on sign-in) and complete-profile (right after it writes
 * the document, because a Firestore write does not re-fire onAuthStateChanged).
 *
 * @returns whether the profile document exists — the auth listener routes on this.
 */
export async function hydrateSession(firebaseUser: User): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (!snap.exists()) return false;

  const data = snap.data();
  useAuthStore.getState().setTier(data.tier ?? 'free');
  // Hydrate the cached profile — EditProfileSheet, post authoring,
  // and the profile header all read from this store.
  useUserStore.getState().setProfile({
    uid: firebaseUser.uid,
    // fullName is the current field; displayName is the pre-rename
    // name still on file for accounts that haven't been re-saved.
    fullName: data.fullName ?? data.displayName ?? firebaseUser.displayName ?? '',
    username: data.username ?? '',
    avatarUrl: data.avatarUrl ?? null,
    bio: data.bio ?? '',
    location: data.location ?? '',
    followersCount: data.followersCount ?? 0,
    followingCount: data.followingCount ?? 0,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  });
  registerPushToken(firebaseUser.uid);
  configureRevenueCat(firebaseUser.uid);
  return true;
}
