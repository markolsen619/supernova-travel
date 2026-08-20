import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
  type UserCredential,
} from 'firebase/auth';

import { auth } from '@/services/firebase';
import { createRawNonce } from '@/utils/nonce';

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
 *
 * There is no Apple equivalent (`signOutApple`) by design, not by omission.
 * expo-apple-authentication exports `signOutAsync`, but its own doc comment
 * says: "It is not recommended to use this method to sign out the user as it
 * works counterintuitively. Instead of using this method it is recommended to
 * simply clear all the user's data collected from using signInAsync or
 * refreshAsync methods." Apple has no client-side session analogous to
 * Google's to release — Firebase sign-out alone is correct for Apple.
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or the native module is unavailable. Firebase
    // sign-out is what must succeed; this is best-effort.
  }
}

export async function isAppleAuthAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Resolves to null when the user dismisses the sheet — cancellation is a
 * normal outcome, not an error. This is the OPPOSITE of Google's contract
 * above: expo-apple-authentication rejects with `ERR_REQUEST_CANCELED` on
 * dismissal (Google's SDK instead resolves with { type: 'cancelled' }), so
 * this path genuinely needs a catch-based check that would be WRONG for
 * Google. Do not "simplify" this to match the Google branch above — that
 * would surface a generic "Sign in failed" error to a user who just tapped
 * away from the sheet.
 */
export async function signInWithApple(): Promise<UserCredential | null> {
  const rawNonce = createRawNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      // Apple gets the HASHED nonce; Firebase (below) gets the RAW value and
      // hashes it itself to compare. Swapping these two fails with an opaque
      // auth/invalid-credential-class error that never mentions "nonce".
      nonce: hashedNonce,
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }

  const { identityToken, fullName } = credential;
  if (!identityToken) throw new Error('Apple sign-in returned no identity token');

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: identityToken,
    // RAW nonce here, not the hashed one sent to Apple above — see comment.
    rawNonce,
  });
  const userCredential = await signInWithCredential(auth, firebaseCredential);

  // fullName is populated ONLY on the user's first-ever authorization for
  // this Apple ID; every subsequent sign-in has it null, and Firebase never
  // fills user.displayName on its own. This is the one moment the name will
  // ever be available, so persist it now — complete-profile reads
  // auth.currentUser.displayName. A private-relay email
  // (@privaterelay.appleid.com) is real and deliverable and needs no special
  // handling; it is already stored as-is on userCredential.user.email.
  const displayName = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ');
  if (displayName) {
    await updateProfile(userCredential.user, { displayName });
  }

  return userCredential;
}
