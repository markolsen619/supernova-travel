import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useRootNavigationState, useSegments, type Href } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { isOnline } from '@/services/offline';
import { isSettledGiftAnswer, shouldClaimAndroidGift } from '@/utils/androidGift';

const checkedKey = (uid: string) => `androidGiftChecked:${uid}`;

/**
 * The Android welcome gift (functions/src/androidGiftFunctions.ts): once per
 * account, on Android, after it reaches the tabs, ask the server whether this
 * account is one of the first 10. On a grant, refresh RevenueCat (the listener
 * in useRevenueCatSync then reads Pro) and show "A year of Pro, on us".
 */
export function useAndroidGift() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const tier = useAuthStore((s) => s.tier);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const navigationState = useRootNavigationState();
  const inTabs = useSegments()[0] === '(tabs)';
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !uid || !isInitialized || !navigationState?.key || !inTabs) return;
    if (asked.current === uid || !isOnline()) return;
    asked.current = uid;
    (async () => {
      const checked = (await AsyncStorage.getItem(checkedKey(uid)).catch(() => null)) !== null;
      if (!shouldClaimAndroidGift({ platform: Platform.OS, tier, checked })) return;
      try {
        const fn = httpsCallable<undefined, { status: string; endsAtMs?: number }>(functions, 'claimAndroidGift');
        const { data } = await fn();
        if (isSettledGiftAnswer(data.status)) await AsyncStorage.setItem(checkedKey(uid), data.status).catch(() => undefined);
        if (data.status !== 'grant' || useAuthStore.getState().user?.uid !== uid) return;
        useAuthStore.getState().setTier('pro');
        useAuthStore.getState().setServerTier('pro');
        try {
          const Purchases = (await import('react-native-purchases')).default;
          await Purchases.invalidateCustomerInfoCache();
          await Purchases.getCustomerInfo();
        } catch {
          // Expo Go, or RevenueCat unreachable: the next launch reads it.
        }
        router.push(`/pro-gift?ends=${data.endsAtMs ?? ''}` as Href);
      } catch (error) {
        asked.current = null; // try again next time the tabs mount
        console.warn('[androidGift] claim failed:', error);
      }
    })();
  }, [uid, tier, isInitialized, navigationState?.key, inTabs]);
}
