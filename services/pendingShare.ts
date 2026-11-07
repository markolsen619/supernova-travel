/**
 * A shared TikTok link waits here until the signed-in tabs can open the save sheet (the pendingInvite pattern): a cold
 * start's sign-in `router.replace('/(tabs)')` would discard anything opened earlier. Kept in AsyncStorage so a share
 * made signed out survives until sign-in; listeners let mounted tabs open it at once.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pendingShare';
const listeners = new Set<() => void>();

export async function setPendingShare(url: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, url); } catch { /* best effort */ }
  listeners.forEach((l) => l());
}

export async function takePendingShare(): Promise<string | null> {
  try {
    const url = await AsyncStorage.getItem(KEY);
    if (url) await AsyncStorage.removeItem(KEY);
    return url;
  } catch {
    return null;
  }
}

export function onPendingShare(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
