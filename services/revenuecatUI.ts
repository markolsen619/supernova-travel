import { PRO_ENTITLEMENT_ID } from '@/constants/revenuecat';
import { isPurchasesReady } from '@/services/revenuecat';

/**
 * RevenueCat's native Paywall and Customer Center.
 *
 * A note on when to use which paywall:
 *
 * `/paywall` (app/paywall.tsx) is the app's own storefront. It follows the
 * Supernova design system, so it's what users see when they deliberately go
 * looking for Pro (Settings, onboarding).
 *
 * The RevenueCat-hosted paywall below is remotely configured — it can be
 * restyled and A/B tested from the dashboard with no app release. That's its
 * whole value, and it's also why it will never match the light-editorial
 * design system exactly. Use it for feature-gate interceptions, where getting
 * the offer in front of the user matters more than the chrome.
 *
 * Both charge through the same offerings and grant the same entitlement.
 */

type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'not_presented' | 'error';

async function loadUI() {
  try {
    const mod = await import('react-native-purchases-ui');
    return mod.default;
  } catch {
    return null; // Expo Go, or the native module isn't in this build.
  }
}

function normalize(result: string): PaywallOutcome {
  switch (result) {
    case 'PURCHASED':
      return 'purchased';
    case 'RESTORED':
      return 'restored';
    case 'CANCELLED':
      return 'cancelled';
    case 'NOT_PRESENTED':
      return 'not_presented';
    default:
      return 'error';
  }
}

/** Present the dashboard-configured paywall unconditionally. */
export async function presentRemotePaywall(): Promise<PaywallOutcome> {
  if (!isPurchasesReady()) return 'not_presented';
  const UI = await loadUI();
  if (!UI) return 'not_presented';
  try {
    return normalize(await UI.presentPaywall({ displayCloseButton: true }));
  } catch (error) {
    console.warn('[revenuecat-ui] presentPaywall failed:', error);
    return 'error';
  }
}

/**
 * Present the paywall only if Pro isn't already active — the right call at a
 * feature gate, because it's a no-op for subscribers and needs no entitlement
 * check of its own.
 *
 * Returns 'not_presented' when the user already has Pro, which callers can
 * treat as "proceed".
 */
export async function presentPaywallIfNeeded(): Promise<PaywallOutcome> {
  if (!isPurchasesReady()) return 'not_presented';
  const UI = await loadUI();
  if (!UI) return 'not_presented';
  try {
    return normalize(
      await UI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
        displayCloseButton: true,
      }),
    );
  } catch (error) {
    console.warn('[revenuecat-ui] presentPaywallIfNeeded failed:', error);
    return 'error';
  }
}

/**
 * The Customer Center — RevenueCat's native subscription-management surface:
 * cancel, change plan, request a refund (iOS), and the "I'm missing a
 * purchase" recovery flow.
 *
 * Worth using rather than hand-rolling: refund requests and plan changes need
 * StoreKit APIs that aren't otherwise exposed, and Apple expects an in-app
 * management path for auto-renewing subscriptions.
 *
 * @returns false when the native module isn't available, so the caller can
 * fall back to the store's own management URL.
 */
export async function presentCustomerCenter(callbacks?: {
  onRestoreCompleted?: () => void;
  onShowingManageSubscriptions?: () => void;
}): Promise<boolean> {
  if (!isPurchasesReady()) return false;
  const UI = await loadUI();
  if (!UI) return false;
  try {
    await UI.presentCustomerCenter({
      callbacks: {
        onRestoreCompleted: callbacks?.onRestoreCompleted,
        onShowingManageSubscriptions: callbacks?.onShowingManageSubscriptions,
      },
    });
    return true;
  } catch (error) {
    console.warn('[revenuecat-ui] presentCustomerCenter failed:', error);
    return false;
  }
}
