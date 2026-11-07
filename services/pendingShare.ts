/** A TikTok link shared while signed out, offline or before auth settled waits here (the pendingInvite pattern). */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pendingShare';

export async function setPendingShare(url: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, url); } catch { /* best effort */ }
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
