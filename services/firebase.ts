import { initializeApp, getApps, getApp } from 'firebase/app';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
// @ts-expect-error — getReactNativePersistence ships only in Firebase's React
// Native build (@firebase/auth/dist/rn), which Metro resolves; it is absent
// from the CJS typings that tsc reads. Runtime export is real.
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (error) {
  // Fast Refresh re-evaluates this module against a live Firebase app whose
  // Auth provider is already initialized. initializeAuth is not idempotent —
  // getReactNativePersistence returns a new class each call, so Firebase's
  // deepEqual guard never matches. Reusing the existing instance is correct
  // here and keeps the persistence configured by the first call.
  if ((error as { code?: string })?.code !== 'auth/already-initialized') {
    // Any other cause means persistence did NOT get configured and we are
    // about to fall back to a memory-only instance. Say so loudly — silent
    // degradation here reintroduces the exact bug this file was changed to fix.
    console.warn('[firebase] initializeAuth failed; auth persistence is NOT active:', error);
  }
  authInstance = getAuth(app);
}
export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
export default app;
