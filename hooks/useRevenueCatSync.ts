import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/useAuthStore';
import { tierFromCustomerInfo } from '@/services/revenuecat';
import { CUSTOMER_INFO_QUERY_KEY } from '@/hooks/useCustomerInfo';
import { reconcileServerTier } from '@/services/tier';
import { shouldReconcileTier } from '@/utils/tierSync';

/**
 * Keeps useAuthStore.tier in lockstep with RevenueCat, for the lifetime of the
 * app. Mount once, in the root layout.
 *
 * This listener is the reason entitlements survive events the app never sees
 * directly: a renewal, a lapse, a refund, a Family Sharing grant, or a
 * purchase made on another device. It fires on configure and on every change
 * thereafter.
 *
 * It is deliberately the *runtime* authority for tier. Firestore's
 * users/{uid}.tier is a server-written mirror (functions/src/syncTier.ts) that
 * exists for Cloud Functions to read; it can lag a purchase by a second or two
 * of webhook latency, which is exactly the window this listener covers.
 *
 * When the two disagree it also asks the server to reconcile
 * (functions/src/reconcileTier.ts), so a late or lost webhook can't leave a
 * paying user rate-limited server-side.
 */
export function useRevenueCatSync() {
  const setTier = useAuthStore((s) => s.setTier);
  const queryClient = useQueryClient();

  useEffect(() => {
    let listener: ((info: unknown) => void) | null = null;
    let cancelled = false;

    (async () => {
      let mod;
      try {
        mod = await import('react-native-purchases');
      } catch {
        return; // Expo Go — no native module.
      }
      if (cancelled) return;

      listener = (info) => {
        const clientTier = tierFromCustomerInfo(info as Parameters<typeof tierFromCustomerInfo>[0]);
        setTier(clientTier);
        // Anything rendering subscription detail re-reads on the next paint.
        queryClient.invalidateQueries({ queryKey: CUSTOMER_INFO_QUERY_KEY });

        // The SDK and Firestore disagree: a purchase the webhook hasn't
        // delivered yet, or a webhook that was lost. Either way the server
        // is enforcing quotas against the wrong tier, so repair it now.
        if (shouldReconcileTier(clientTier, useAuthStore.getState().serverTier)) {
          reconcileServerTier(queryClient);
        }
      };
      mod.default.addCustomerInfoUpdateListener(
        listener as Parameters<typeof mod.default.addCustomerInfoUpdateListener>[0],
      );
    })();

    return () => {
      cancelled = true;
      if (!listener) return;
      import('react-native-purchases')
        .then((mod) =>
          mod.default.removeCustomerInfoUpdateListener(
            listener as Parameters<typeof mod.default.removeCustomerInfoUpdateListener>[0],
          ),
        )
        .catch(() => {
          // Module was never available; nothing was registered.
        });
    };
  }, [setTier, queryClient]);
}
