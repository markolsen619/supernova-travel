import { useEffect, useRef, useState } from 'react';
import { router, useRootNavigationState, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { resolveNotificationRoute } from '@/utils/notificationRoute';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Routes a tapped notification to the screen it's about.
 *
 * Two delivery paths, because Expo reports them differently:
 *  - warm/background: addNotificationResponseReceivedListener fires the tap
 *  - cold start: the app launches with the tap already spent, and
 *    getLastNotificationResponseAsync is the only way to learn about it
 *
 * Neither can navigate immediately. A cold-start tap resolves before the auth
 * listener in app/_layout.tsx has finished hydrating, and that listener ends
 * in router.replace('/(tabs)') — which would silently discard any navigation
 * made before it. So a resolved route is held and consumed only once the root
 * navigator exists AND auth has settled on a signed-in user.
 *
 * Holding rather than dropping also covers the signed-out tap: someone who
 * taps a DM notification, signs in, and then lands in that thread.
 */
export function useNotificationRouting() {
  const navigationState = useRootNavigationState();
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  /** Notification ids already turned into a route. The launching tap can
   *  arrive from BOTH paths above; without this it would navigate twice. */
  const handled = useRef(new Set<string>());

  useEffect(() => {
    function accept(response: Notifications.NotificationResponse | null) {
      if (!response) return;
      const { identifier } = response.notification.request;
      if (handled.current.has(identifier)) return;

      const route = resolveNotificationRoute(response.notification.request.content.data);
      // No route means an unknown or unroutable payload: leave the user
      // wherever the app opens rather than guessing.
      if (!route) return;

      handled.current.add(identifier);
      setPendingRoute(route);
    }

    Notifications.getLastNotificationResponseAsync()
      .then(accept)
      .catch((error) => {
        console.warn('[push] could not read the launching notification:', error);
      });

    const subscription = Notifications.addNotificationResponseReceivedListener(accept);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pendingRoute) return;
    // navigationState.key is expo-router's "the root navigator is mounted"
    // signal. Navigating before it exists is dropped without an error.
    if (!navigationState?.key || !isInitialized || !uid) return;

    setPendingRoute(null);
    // expo-router's typedRoutes can't statically check a route built at
    // runtime from a server payload; resolveNotificationRoute is the thing
    // that guarantees it's one of ours.
    router.push(pendingRoute as Href);
  }, [pendingRoute, navigationState?.key, isInitialized, uid]);
}
