import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { Tier } from '@/types';
import {
  shouldPromptForPush,
  PushPromptTrigger,
  PushPermission,
} from '@/utils/pushPrompt';

/**
 * Notification permission, split into the half that may prompt and the half
 * that never does.
 *
 * hydrateSession() used to call one function that did both, so every new
 * account met the iOS permission sheet cold, mid-onboarding, before the app
 * had anything to notify them about. iOS grants one sheet per install: once
 * it's spent, the only way back is Settings. So the prompt now fires at a
 * moment that explains itself (see utils/pushPrompt.ts), and sign-in only
 * refreshes the token of a user who already said yes.
 */

/** Namespaced per uid: two accounts on one device get one ask each. */
const askedKey = (uid: string) => `push_prompted:${uid}`;

/**
 * Writes this device's Expo token onto the user doc. Caller must have
 * confirmed permission — this does not check and does not prompt.
 */
async function storeToken(uid: string): Promise<void> {
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  const existing: string[] = snap.data().expoPushTokens ?? [];
  if (existing.includes(token)) return;
  await updateDoc(userRef, { expoPushTokens: arrayUnion(token) });
}

/**
 * Called on every sign-in. Never prompts: it only refreshes the stored token
 * for a user who has already granted permission, which is what keeps a new
 * device or a reinstall receiving pushes without re-asking.
 */
export async function registerPushTokenIfGranted(uid: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await storeToken(uid);
}

/**
 * Asks for notification permission, but only if this moment warrants it —
 * see shouldPromptForPush for the rules. Safe to call unconditionally at a
 * trigger point; it decides whether anything happens.
 *
 * Never throws: a permission prompt failing must not take down the action
 * the user actually performed (sending a message, saving a boarding pass).
 */
export async function maybePromptForPush(
  uid: string,
  tier: Tier,
  trigger: PushPromptTrigger,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Cheapest check first: this runs on every send, and after the one ask
    // it should cost a single AsyncStorage read rather than a native call.
    const alreadyAsked = (await AsyncStorage.getItem(askedKey(uid))) !== null;
    if (alreadyAsked) return;

    const { status } = await Notifications.getPermissionsAsync();

    if (
      !shouldPromptForPush({
        trigger,
        tier,
        permission: status as PushPermission,
        alreadyAsked,
      })
    ) {
      return;
    }

    // Recorded before the sheet, not after: if the app is killed while the
    // sheet is up, the ask still counts. Re-prompting on every send is a
    // worse failure than missing one ask.
    await AsyncStorage.setItem(askedKey(uid), '1');

    const { status: next } = await Notifications.requestPermissionsAsync();
    if (next === 'granted') await storeToken(uid);
  } catch (error) {
    console.warn('[push] permission prompt failed:', error);
  }
}
