import { useCallback } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/useAuthStore';
import { isPaidTier } from '@/utils/proFeatures';

/**
 * One way to gate a Pro feature everywhere: `requirePro(action)` runs the
 * action for a subscriber and opens the paywall for everyone else. Uses the
 * live tier (RevenueCat), so a purchase unlocks immediately.
 */
export function useProGate() {
  const tier = useAuthStore((s) => s.tier);
  const isPro = isPaidTier(tier);
  const openPaywall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/paywall');
  }, []);
  const requirePro = useCallback(
    (action: () => void) => (isPro ? action() : openPaywall()),
    [isPro, openPaywall],
  );
  return { tier, isPro, requirePro, openPaywall };
}
