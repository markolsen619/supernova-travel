/**
 * The rating prompt's state on this phone and the ask itself (rules in utils/reviewPrompt.ts). `happyMoment` is called
 * after a trip is saved, a wish-list save, or finishing Year in Travel; it waits a moment so the prompt never covers
 * the transition. Never throws; does nothing where the store prompt isn't available.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { recordMoment, shouldAskForReview, type HappyMoment, type ReviewState } from '@/utils/reviewPrompt';

const KEY = 'reviewPrompt:v1';

async function load(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ReviewState;
  } catch { /* fresh state */ }
  return { installedAtMs: Date.now(), moments: 0, tripsSaved: 0, lastAskedAtMs: null };
}

export async function happyMoment(kind: HappyMoment): Promise<void> {
  try {
    let s = recordMoment(await load(), kind);
    const now = Date.now();
    if (shouldAskForReview(s, now) && (await StoreReview.isAvailableAsync())) {
      s = { ...s, lastAskedAtMs: now };
      setTimeout(() => { StoreReview.requestReview().catch(() => {}); }, 1500);
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* never in the way */ }
}
