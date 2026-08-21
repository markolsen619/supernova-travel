import { User } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/services/firebase';
import { configureRevenueCat } from '@/services/revenuecat';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';

// Pre-namespacing (per-uid) onboarding flag. Never write this key again —
// it survives only as a one-time migration source inside hydrateSession.
const LEGACY_ONBOARDING_KEY = 'onboarding_complete';

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
      const { updateDoc: updateTokenDoc, arrayUnion } = await import('firebase/firestore');
      await updateTokenDoc(userRef, { expoPushTokens: arrayUnion(token) });
    }
  }
}

/**
 * Pure resolution of whether a user has completed onboarding, given their
 * Firestore user doc data and whether the legacy per-device AsyncStorage flag
 * was present on this device. `hasSeenOnboarding` is the field name reused
 * from an earlier version of this app — two of three pre-existing user docs
 * already carry it, so renaming it would silently re-onboard them. Strict
 * `=== true` because a legacy-shape doc could hold anything (or nothing) in
 * that slot, never a guaranteed boolean.
 */
export function resolveHasSeenOnboarding(
  data: Record<string, unknown>,
  legacyFlagPresent: boolean,
): boolean {
  if (data.hasSeenOnboarding === true) return true;
  if (legacyFlagPresent) return true;
  return false;
}

/**
 * Everything that must happen once a signed-in user's profile document is
 * known to exist. Called from two places that CANNOT be collapsed into one:
 * the auth listener (on sign-in) and complete-profile (right after it writes
 * the document, because a Firestore write does not re-fire onAuthStateChanged).
 *
 * @returns whether the profile document exists, and whether the user has
 * completed onboarding — the auth listener routes on both.
 */
export async function hydrateSession(
  firebaseUser: User,
): Promise<{ hasProfile: boolean; hasSeenOnboarding: boolean }> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return { hasProfile: false, hasSeenOnboarding: false };

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

  let legacyFlagPresent = false;
  if (!('hasSeenOnboarding' in data)) {
    // One-time migration off the old bare, un-namespaced AsyncStorage key.
    // Read it once; if this device previously completed onboarding under
    // the old per-device scheme, carry that forward onto the Firestore doc
    // so it survives sign-out/sign-in and device changes going forward.
    const legacyValue = await AsyncStorage.getItem(LEGACY_ONBOARDING_KEY);
    legacyFlagPresent = Boolean(legacyValue);
    if (legacyFlagPresent) {
      // Fire-and-forget on purpose: awaiting either of these would add
      // latency to every cold-start routing decision and introduce a new
      // failure mode into the auth path. See app/_layout.tsx's try/finally.
      updateDoc(userRef, { hasSeenOnboarding: true }).catch(() => {});
      AsyncStorage.removeItem(LEGACY_ONBOARDING_KEY).catch(() => {});
    }
  }

  return {
    hasProfile: true,
    hasSeenOnboarding: resolveHasSeenOnboarding(data, legacyFlagPresent),
  };
}
