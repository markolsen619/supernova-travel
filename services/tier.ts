import { httpsCallable } from 'firebase/functions';
import type { QueryClient } from '@tanstack/react-query';
import { functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Tier } from '@/types';

interface ReconcileTierResponse {
  tier: Tier;
  reconciled: boolean;
  changed: boolean;
}

/**
 * The quota queries whose answer depends on users/{uid}.tier. Prefix keys, so
 * they match every uid-suffixed variant.
 */
const TIER_DEPENDENT_QUERY_KEYS = [['aiTripQuota'], ['importQuota']] as const;

let inFlight: Promise<Tier | null> | null = null;

/**
 * Asks the server to re-read the tier from RevenueCat (functions/src/reconcileTier.ts),
 * then refreshes everything that was computed from the old one.
 *
 * Two callers can race here on a single purchase: the CustomerInfo listener
 * (useRevenueCatSync) and the quota-limit paywall flow (useLimitPaywall).
 * They share one in-flight call instead of spending the server's cooldown
 * twice.
 *
 * Never throws. A failed reconcile leaves things as they were, since the
 * webhook may still land, so it's logged rather than shown to the user.
 *
 * @returns the tier the server now holds, or null if the call failed.
 */
export function reconcileServerTier(queryClient: QueryClient): Promise<Tier | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const fn = httpsCallable<undefined, ReconcileTierResponse>(functions, 'reconcileTier');
      const { data } = await fn();
      useAuthStore.getState().setServerTier(data.tier);
      await Promise.all(
        TIER_DEPENDENT_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      return data.tier;
    } catch (error) {
      console.warn('[tier] reconcile failed:', error);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
