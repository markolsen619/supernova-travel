import type { Tier } from '@/types';
import type { PaywallOutcome } from '@/services/revenuecatUI';

/**
 * Whether the server's copy of the tier needs repairing.
 *
 * `clientTier` comes from the RevenueCat SDK, the runtime authority.
 * `serverTier` is what users/{uid} last reported, which is what Cloud
 * Functions enforce quotas against. A mismatch means the webhook hasn't landed
 * yet (the seconds after a purchase) or never will (an outage). Either way the
 * fix is the same reconcileTier call, which reads RevenueCat directly.
 *
 * A null serverTier means no profile has been read for this session. There's
 * nothing to compare yet, and a signed-out listener event must not call an
 * authenticated function.
 */
export function shouldReconcileTier(clientTier: Tier, serverTier: Tier | null): boolean {
  return serverTier !== null && clientTier !== serverTier;
}

/**
 * What to do after the hosted paywall closes at a quota limit.
 *
 * - `refresh`: Pro is active: just bought, restored, or already held
 *   (`not_presented`: the server rejected a user the SDK says is Pro, which is
 *   exactly a stale server tier). Reconcile, refresh quotas, return the user to
 *   what they were doing.
 * - `close`: they declined. Return them without upselling again.
 * - `storefront`: the hosted paywall couldn't be shown. Fall back to the app's
 *   own /paywall so the limit still leads somewhere.
 */
export type LimitPaywallAction = 'refresh' | 'close' | 'storefront';

export function resolveLimitPaywallAction(outcome: PaywallOutcome): LimitPaywallAction {
  switch (outcome) {
    case 'purchased':
    case 'restored':
    case 'not_presented':
      return 'refresh';
    case 'cancelled':
      return 'close';
    case 'unavailable':
    case 'error':
      return 'storefront';
  }
}
