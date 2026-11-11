/**
 * A shared TikTok link or screenshots (spec 2026-11-11) wait here until the signed-in tabs can open the save sheet (the pendingInvite pattern): a cold
 * start's sign-in `router.replace('/(tabs)')` would discard anything opened earlier. Kept in AsyncStorage so a share
 * made signed out survives until sign-in; listeners let mounted tabs open it at once.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encodePendingShare, parsePendingShare, type ShareKind } from '@/utils/wishShots';

const KEY = 'pendingShare';
const listeners = new Set<() => void>();

export async function setPendingShare(p: ShareKind): Promise<void> {
  try { await AsyncStorage.setItem(KEY, encodePendingShare(p)); } catch { /* best effort */ }
  listeners.forEach((l) => l());
}

export async function takePendingShare(): Promise<ShareKind | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) await AsyncStorage.removeItem(KEY);
    return parsePendingShare(raw);
  } catch {
    return null;
  }
}

export function onPendingShare(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
