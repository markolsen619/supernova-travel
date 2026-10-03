import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { router, useRootNavigationState, type Href } from 'expo-router';
import { resolveLinkRoute } from '@/utils/linkRoute';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Opens the screen a link launched the app for (a shared trip).
 *
 * Expo Router does mount the linked screen on a cold start, but the auth
 * listener in app/_layout.tsx then ends in router.replace('/(tabs)'), which
 * throws it away — so the link is held and pushed once the root navigator
 * exists and auth has settled on a signed-in user, the same as a cold-start
 * notification tap (useNotificationRouting). A link that arrives while the
 * app is running is routed by Expo Router itself.
 */
export function useLinkRouting() {
  const navigationState = useRootNavigationState();
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => setPendingRoute(resolveLinkRoute(url)))
      .catch((error) => console.warn('[link] could not read the launching link:', error));
  }, []);

  useEffect(() => {
    if (!pendingRoute) return;
    if (!navigationState?.key || !isInitialized || !uid) return;
    setPendingRoute(null);
    // resolveLinkRoute only ever returns /trip/{alphanumeric id}.
    router.push(pendingRoute as Href);
  }, [pendingRoute, navigationState?.key, isInitialized, uid]);
}
