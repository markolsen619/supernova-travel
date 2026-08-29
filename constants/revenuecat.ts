import type { Tier } from '@/types';

/**
 * The entitlement configured in the RevenueCat dashboard. Every product
 * (monthly, yearly, lifetime) grants this same entitlement — which is the
 * point of entitlements: the app asks "is Pro unlocked?", never "which SKU
 * did they buy?". Adding a new plan later needs no client change.
 */
export const PRO_ENTITLEMENT_ID = 'supernova_pro';

/**
 * The offering to show on the paywall. 'default' is RevenueCat's own name for
 * the current offering, so changing which plans are on sale is a dashboard
 * action, not an app release.
 */
export const DEFAULT_OFFERING_ID = 'default';

/**
 * Store product identifiers, for reference and for the Cloud Function webhook.
 * The client does NOT look plans up by these — it reads PACKAGE_TYPE off the
 * offering instead, which survives a store-side product rename.
 */
export const PRODUCT_IDS = {
  monthly: 'monthly',
  yearly: 'yearly',
  lifetime: 'lifetime',
} as const;

/** Display order on the paywall — yearly first, since it's the one to sell. */
export const PLAN_DISPLAY_ORDER = ['ANNUAL', 'MONTHLY', 'LIFETIME'] as const;

/**
 * Entitlement -> app tier. Kept as a map rather than a boolean so that adding
 * the 'business' tier later is a one-line change here instead of a hunt
 * through every isPro check.
 */
export const ENTITLEMENT_TO_TIER: Record<string, Tier> = {
  [PRO_ENTITLEMENT_ID]: 'pro',
};
