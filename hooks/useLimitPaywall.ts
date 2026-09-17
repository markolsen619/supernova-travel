import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { presentPaywallIfNeeded } from '@/services/revenuecatUI';
import { reconcileServerTier } from '@/services/tier';
import { resolveLimitPaywallAction } from '@/utils/tierSync';

/**
 * What happens when a free user hits a server-enforced limit.
 *
 * A limit is a feature-gate interception, so it gets RevenueCat's hosted
 * paywall, which can be restyled and A/B tested from the dashboard. The app's
 * own /paywall is for users who go looking for Pro. See services/revenuecatUI.ts.
 *
 * @param onReturn where to send the user once the paywall closes without
 *   falling back, whether they upgraded or declined. A loading screen passes
 *   router.back so they land on the form they came from. A screen that is
 *   already the form passes nothing and simply stays.
 */
export function useLimitPaywall(onReturn?: () => void) {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    const outcome = await presentPaywallIfNeeded();

    switch (resolveLimitPaywallAction(outcome)) {
      case 'refresh':
        // Awaited, not left to the CustomerInfo listener: by the time the user
        // is back on the form, the server must already hold the new tier, and
        // the quota badge must already say so. Otherwise their first retry
        // hits the same limit.
        await reconcileServerTier(queryClient);
        onReturn?.();
        return;
      case 'close':
        onReturn?.();
        return;
      case 'storefront':
        router.replace('/paywall');
        return;
    }
  }, [queryClient, onReturn]);
}
