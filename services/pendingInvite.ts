/** One invite waiting for the account to exist (spec 2026-10-30): from a link opened signed out, the Play install referrer, or Paste. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { parseInstallReferrer } from '@/utils/inviteLinks';

const KEY = 'pendingInvite';
const REFERRER_KEY = 'installReferrerChecked';

export async function savePendingInvite(token: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, token); } catch { /* best effort */ }
}
export async function readPendingInvite(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEY); } catch { return null; }
}
export async function clearPendingInvite(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
}

/** Android: Google Play hands the invite through the install. Read once per install. */
export async function checkInstallReferrerOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (await AsyncStorage.getItem(REFERRER_KEY)) return;
    await AsyncStorage.setItem(REFERRER_KEY, '1');
    const token = parseInstallReferrer(await Application.getInstallReferrerAsync());
    if (token) await savePendingInvite(token);
  } catch { /* no referrer service: nothing to do */ }
}
