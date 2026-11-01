/** One invite waiting for the account to exist (spec 2026-10-30): from a link opened signed out, the Play install referrer, or Paste. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import { parseInstallReferrer, parseInviteToken, shouldCheckClipboard } from '@/utils/inviteLinks';

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
    const token = parseInstallReferrer(await Application.getInstallReferrerAsync());
    if (token) await savePendingInvite(token);
    // Marked only after a read: on first launch Play's service may not be bound yet, and a failed read is tried next start.
    await AsyncStorage.setItem(REFERRER_KEY, '1');
  } catch { /* no referrer service: nothing to do */ }
}

/**
 * iPhone: the invite page copies the link when someone taps Download on the App Store. A new account looks at the
 * clipboard once (utils/inviteLinks shouldCheckClipboard). Checking whether there's anything copied asks nothing;
 * reading it shows iOS's Allow Paste question, so it's read only when something is there. Never throws.
 */
export async function inviteFromClipboardOnce(uid: string, createdAtMs: number | null): Promise<string | null> {
  const key = `clipboardInviteChecked:${uid}`;
  try {
    const alreadyChecked = !!(await AsyncStorage.getItem(key));
    if (!shouldCheckClipboard({ platform: Platform.OS, createdAtMs, nowMs: Date.now(), alreadyChecked, hasPending: false })) return null;
    await AsyncStorage.setItem(key, '1');
    if (!(await Clipboard.hasUrlAsync().catch(() => false)) && !(await Clipboard.hasStringAsync())) return null;
    return parseInviteToken(await Clipboard.getStringAsync());
  } catch {
    return null;
  }
}
