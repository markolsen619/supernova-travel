import { useQuery } from '@tanstack/react-query';
import type { CustomerInfo } from 'react-native-purchases';
import {
  fetchCustomerInfo,
  whenConfigured,
  isProActive,
  isLifetimeUnlock,
  proExpirationDate,
  isExpiringSoon,
} from '@/services/revenuecat';

export const CUSTOMER_INFO_QUERY_KEY = ['revenuecat', 'customerInfo'] as const;

/**
 * The subscription state for display (Settings, account screen).
 *
 * For gating features, read `tier` from useAuthStore instead — it's kept live
 * by useRevenueCatSync and doesn't require this query to have resolved.
 */
export function useCustomerInfo() {
  const query = useQuery({
    queryKey: CUSTOMER_INFO_QUERY_KEY,
    queryFn: async (): Promise<CustomerInfo | null> => {
      const ready = await whenConfigured();
      return ready ? fetchCustomerInfo() : null;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const info = query.data ?? null;

  return {
    customerInfo: info,
    isPro: isProActive(info),
    isLifetime: isLifetimeUnlock(info),
    /** ISO date, or null for lifetime / free. */
    expirationDate: proExpirationDate(info),
    /** Active but auto-renew is off — worth surfacing while they can still change their mind. */
    isExpiring: isExpiringSoon(info),
    /** Store the purchase was made through, for the "manage" deep link. */
    managementURL: info?.managementURL ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
