import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PurchasesPackage } from 'react-native-purchases';
import { useAuthStore } from '@/stores/useAuthStore';
import { tierFromCustomerInfo, isProActive } from '@/services/revenuecat';
import { purchaseErrorMessage, restoreErrorMessage, isUserCancellation } from '@/utils/purchaseErrors';
import { CUSTOMER_INFO_QUERY_KEY } from '@/hooks/useCustomerInfo';

export type PurchaseOutcome =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'pending' }
  | { status: 'error'; message: string };

/**
 * Purchase and restore flows.
 *
 * Note what this hook does NOT do: write users/{uid}.tier. That field is
 * server-owned — the RevenueCat webhook (functions/src/syncTier.ts) is its
 * only writer, because a client that can grant itself 'pro' can grant itself
 * unlimited AI trip generation. The local setTier here only moves the UI
 * ahead of the webhook's round trip.
 */
export function usePurchases() {
  const setTier = useAuthStore((s) => s.setTier);
  const queryClient = useQueryClient();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
      setIsPurchasing(true);
      setError(null);
      try {
        const { default: Purchases } = await import('react-native-purchases');
        const { customerInfo } = await Purchases.purchasePackage(pkg);

        if (isProActive(customerInfo)) {
          setTier(tierFromCustomerInfo(customerInfo));
          queryClient.invalidateQueries({ queryKey: CUSTOMER_INFO_QUERY_KEY });
          return { status: 'purchased' };
        }

        // Purchase succeeded at the store but the entitlement isn't live yet —
        // deferred/pending payment (Ask to Buy, slow bank auth). Not an error,
        // and not a grant: the webhook will flip the tier when it clears.
        return { status: 'pending' };
      } catch (e: unknown) {
        if (isUserCancellation(e)) return { status: 'cancelled' };
        const message = purchaseErrorMessage(e) ?? "That didn't go through. Try again.";
        setError(message);
        return { status: 'error', message };
      } finally {
        setIsPurchasing(false);
      }
    },
    [setTier, queryClient],
  );

  /**
   * Restore is not optional polish — Apple requires a visible restore path on
   * any screen selling a non-consumable, and 'lifetime' is one. It's also how
   * a user recovers Pro on a new device.
   */
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    setIsRestoring(true);
    setError(null);
    try {
      const { default: Purchases } = await import('react-native-purchases');
      const customerInfo = await Purchases.restorePurchases();
      const restored = isProActive(customerInfo);
      setTier(tierFromCustomerInfo(customerInfo));
      queryClient.invalidateQueries({ queryKey: CUSTOMER_INFO_QUERY_KEY });
      if (!restored) {
        setError("We didn't find a previous purchase on this account.");
      }
      return restored;
    } catch (e: unknown) {
      setError(restoreErrorMessage(e));
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, [setTier, queryClient]);

  return {
    purchase,
    restorePurchases,
    isPurchasing,
    isRestoring,
    /** Kept for callers that only care that something is in flight. */
    isLoading: isPurchasing || isRestoring,
    error,
    clearError,
  };
}
