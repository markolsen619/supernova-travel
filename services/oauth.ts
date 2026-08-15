import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, type UserCredential } from 'firebase/auth';

import { auth } from '@/services/firebase';

/**
 * webClientId is required even on iOS — it is the audience Firebase validates
 * the idToken against. Omitting it fails with a generic auth error that never
 * mentions configuration. iosClientId is read automatically from
 * GoogleService-Info.plist; do not hardcode it.
 */
export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

/**
 * Resolves to null when the user dismisses the sheet — cancellation is a
 * normal outcome, not an error. Since v13 of @react-native-google-signin the
 * SDK signals it by resolving with { type: 'cancelled' } rather than
 * throwing, so a catch block built around cancellation would never fire.
 * Callers check the return value: `if (!credential) return;`.
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;

  const { idToken } = response.data;
  if (!idToken) throw new Error('Google sign-in returned no ID token');
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

/**
 * Releases the native Google session as well as Firebase's. Without this the
 * SDK silently re-authorizes the same account on the next attempt, so
 * "use a different account" would loop straight back to the same one.
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or the native module is unavailable. Firebase
    // sign-out is what must succeed; this is best-effort.
  }
}

/**
 * Phase 2. Apple sign-in needs an entitlement this App ID does not yet carry,
 * and expo-apple-authentication is not installed in this phase. This function
 * body is replaced when Apple sign-in ships.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  return false;
}
