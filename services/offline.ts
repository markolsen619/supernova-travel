// services/offline.ts
/**
 * Connectivity for the offline trips feature (spec §3). NetInfo drives TanStack's onlineManager, so queries
 * pause offline and keep showing saved data instead of erroring, then refetch when signal returns.
 * Writes are refused offline (requireOnline): with Firestore's web build an offline write waits in memory
 * and is lost if the app closes.
 */
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

export function startOnlineSync(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable is null while unknown; treat unknown as online so a slow probe never blocks.
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );
  return () => onlineManager.setEventListener(() => undefined);
}

export function isOnline(): boolean {
  return onlineManager.isOnline();
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
}

export function requireOnline(): boolean {
  if (onlineManager.isOnline()) return true;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Alert.alert("You're offline", 'Try again when you\'re connected.');
  return false;
}
