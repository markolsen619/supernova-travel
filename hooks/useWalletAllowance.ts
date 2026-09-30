import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { useReservations } from '@/hooks/useReservations';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { useProGate } from '@/hooks/useProGate';
import { FREE_WALLET_LIMIT, walletAddAllowed } from '@/utils/proFeatures';

/**
 * How much of the free wallet allowance is used, across passes,
 * reservations and loyalty cards together. Reads the same cached queries the
 * wallet already loads — no extra reads.
 */
export function useWalletAllowance() {
  const { tier, isPro, openPaywall } = useProGate();
  const { boardingPasses, isLoading: a } = useBoardingPasses();
  const { reservations, isLoading: b } = useReservations();
  const { loyaltyPrograms, isLoading: c } = useLoyaltyPrograms();
  const total = boardingPasses.length + reservations.length + loyaltyPrograms.length;
  return {
    isPro,
    total,
    limit: FREE_WALLET_LIMIT,
    // While loading, don't block — the save guard re-checks with real counts.
    canAdd: a || b || c ? true : walletAddAllowed(tier, total),
    openPaywall,
  };
}
