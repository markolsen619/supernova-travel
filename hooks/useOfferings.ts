import { useQuery } from '@tanstack/react-query';
import type { PurchasesOffering } from 'react-native-purchases';
import { whenConfigured } from '@/services/revenuecat';
import { buildPlanViews, type PlanView } from '@/utils/offerings';

async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  const mod = await import('react-native-purchases');
  const offerings = await mod.default.getOfferings();
  // `current` follows whichever offering is marked current in the dashboard,
  // so swapping which plans are on sale needs no app release.
  return offerings.current ?? null;
}

/**
 * The plans to show on the paywall, straight from the store.
 *
 * Prices are never hardcoded — they arrive localised and tax-correct from
 * StoreKit / Play Billing via RevenueCat. The previous paywall hardcoded
 * "$4.99 / month", which is wrong in every non-USD storefront.
 */
export function useOfferings() {
  const query = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: async (): Promise<PlanView[]> => {
      // configureRevenueCat is fire-and-forget in hydrateSession, so the SDK
      // may still be configuring when this screen mounts. Awaiting here (
      // rather than gating `enabled` on a non-reactive boolean) means a
      // paywall opened in that window still resolves instead of hanging.
      const ready = await whenConfigured();
      if (!ready) return [];
      const offering = await fetchCurrentOffering();
      if (!offering) return [];
      return buildPlanViews(offering.availablePackages);
    },
    // Store metadata is stable; refetching it on every focus is wasted work.
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    plans: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
