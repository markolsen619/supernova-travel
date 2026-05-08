import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';

type PurchasesPackage = import('react-native-purchases').PurchasesPackage;

export function usePurchases() {
  const setTier = useAuthStore((s) => s.setTier);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchasePro = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { default: Purchases } = await import('react-native-purchases');
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const isActive = !!customerInfo.entitlements.active['pro'];
      if (isActive) setTier('pro');
      return isActive;
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'userCancelled' in e && (e as { userCancelled: boolean }).userCancelled) {
        return false;
      }
      setError('Purchase failed. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setTier]);

  const restorePurchases = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const { default: Purchases } = await import('react-native-purchases');
      const customerInfo = await Purchases.restorePurchases();
      const isActive = !!customerInfo.entitlements.active['pro'];
      if (isActive) setTier('pro');
    } catch {
      setError('Restore failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [setTier]);

  return { purchasePro, restorePurchases, isLoading, error };
}
