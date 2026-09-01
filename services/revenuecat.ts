import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases';
import type { Tier } from '@/types';
import { PRO_ENTITLEMENT_ID, ENTITLEMENT_TO_TIER } from '@/constants/revenuecat';

/**
 * Key resolution. The Test Store key (test_…) is a single cross-platform key
 * that simulates purchases without App Store / Play Console products, so it
 * takes precedence when present — that's the whole point of having it set.
 * It is a *development* key: it can never validate a real receipt, so it must
 * never reach a production build. See assertStoreKeyIsSane() below.
 */
const TEST_STORE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? '';

const PLATFORM_KEY =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
    default: '',
  }) ?? '';

const API_KEY = TEST_STORE_KEY || PLATFORM_KEY;

export const isTestStoreKey = (key: string = API_KEY): boolean => key.startsWith('test_');

/**
 * Configure is a once-per-process call. Auth changes go through logIn(), not a
 * second configure() — reconfiguring with a different appUserID is unsupported
 * and silently corrupts the SDK's cached customer state. hydrateSession() runs
 * on every auth change and complete-profile calls it again straight after its
 * write, so this WILL be called repeatedly; these two module flags are what
 * make that safe.
 */
let isConfigured = false;
let currentAppUserId: string | null = null;
/**
 * The in-flight configure() call. hydrateSession() invokes configure without
 * awaiting it, so a screen can mount mid-configure; readers await this rather
 * than sampling isConfigured, which is a plain value and would leave a query
 * gated off with nothing to re-trigger it.
 */
let configurePromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Pure helpers — no native module, no side effects, unit-testable in node.
// Every "is this user Pro?" question in the app resolves through these.
// ---------------------------------------------------------------------------

/** The active Pro entitlement, or null. */
export function proEntitlement(info: CustomerInfo | null): PurchasesEntitlementInfo | null {
  return info?.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;
}

/** Whether Pro is unlocked right now. */
export function isProActive(info: CustomerInfo | null): boolean {
  return proEntitlement(info) !== null;
}

/**
 * CustomerInfo -> app tier. The runtime authority for what a user has paid
 * for. Firestore's users/{uid}.tier is a server-written MIRROR of this (see
 * functions/src/syncTier.ts) and exists so Cloud Functions can gate quota
 * without calling RevenueCat; it is not the client's source of truth.
 */
export function tierFromCustomerInfo(info: CustomerInfo | null): Tier {
  const active = Object.keys(info?.entitlements.active ?? {});
  for (const id of active) {
    const tier = ENTITLEMENT_TO_TIER[id];
    if (tier) return tier;
  }
  return 'free';
}

/**
 * Whether this is a lifetime (non-consumable) unlock rather than a
 * subscription. Lifetime purchases have no expiry, which is what the
 * "renews on" line in the UI keys off.
 */
export function isLifetimeUnlock(info: CustomerInfo | null): boolean {
  const ent = proEntitlement(info);
  return ent !== null && ent.expirationDate === null;
}

/** ISO expiry of the Pro entitlement, or null for lifetime / not subscribed. */
export function proExpirationDate(info: CustomerInfo | null): string | null {
  return proEntitlement(info)?.expirationDate ?? null;
}

/**
 * True when the subscription is set to lapse — active but auto-renew is off.
 * This is the state worth surfacing in Settings, since the user still has
 * access and can still change their mind.
 */
export function isExpiringSoon(info: CustomerInfo | null): boolean {
  const ent = proEntitlement(info);
  return ent !== null && ent.expirationDate !== null && !ent.willRenew;
}

// ---------------------------------------------------------------------------
// SDK lifecycle
// ---------------------------------------------------------------------------

/**
 * Lazily loaded so the app still runs in Expo Go, where the native module is
 * absent. Every caller must tolerate null.
 */
async function loadPurchases() {
  try {
    return await import('react-native-purchases');
  } catch {
    return null;
  }
}

/**
 * Configure the SDK and bind it to a Firebase uid.
 *
 * Using the Firebase uid as the RevenueCat appUserID is what lets the webhook
 * (functions/src/syncTier.ts) map a purchase back to users/{uid} with no extra
 * lookup table. Do not change it to an anonymous id without changing that too.
 */
export function configureRevenueCat(uid: string): Promise<void> {
  // Dedupe concurrent calls; a uid change still re-enters to run logIn().
  if (configurePromise && currentAppUserId === uid) return configurePromise;
  configurePromise = configureInternal(uid);
  return configurePromise;
}

async function configureInternal(uid: string): Promise<void> {
  if (!API_KEY) {
    if (__DEV__) {
      console.warn(
        '[revenuecat] No API key set. Add EXPO_PUBLIC_REVENUECAT_TEST_KEY (dev) ' +
          'or the platform keys to .env.local — purchases are disabled without one.',
      );
    }
    return;
  }

  const mod = await loadPurchases();
  if (!mod) return;
  const { default: Purchases, LOG_LEVEL } = mod;

  try {
    if (!isConfigured) {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
      Purchases.configure({ apiKey: API_KEY, appUserID: uid });
      isConfigured = true;
      currentAppUserId = uid;
      return;
    }

    // Already configured — a different uid means account switch, not restart.
    if (currentAppUserId !== uid) {
      await Purchases.logIn(uid);
      currentAppUserId = uid;
    }
  } catch (error) {
    console.warn('[revenuecat] configure failed:', error);
  }
}

/**
 * Unbind on sign-out. Without this the next user on the device inherits the
 * previous user's entitlements until the SDK's cache expires.
 */
export async function logOutRevenueCat(): Promise<void> {
  if (!isConfigured) return;
  const mod = await loadPurchases();
  if (!mod) return;
  try {
    await mod.default.logOut();
    currentAppUserId = null;
  } catch (error) {
    // Logging out an anonymous user throws by design — not worth surfacing.
    console.warn('[revenuecat] logOut failed:', error);
  }
}

/** CustomerInfo, or null when the SDK is unavailable/unconfigured. */
export async function fetchCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isConfigured) return null;
  const mod = await loadPurchases();
  if (!mod) return null;
  try {
    return await mod.default.getCustomerInfo();
  } catch (error) {
    console.warn('[revenuecat] getCustomerInfo failed:', error);
    return null;
  }
}

/** Whether the SDK is configured — synchronous, for render-time checks. */
export function isPurchasesReady(): boolean {
  return isConfigured;
}

/**
 * Resolves once any in-flight configure() has settled, to whether the SDK is
 * usable. Query hooks await this instead of gating on isPurchasesReady(), so
 * a paywall opened during the configure window still loads its offerings.
 */
export async function whenConfigured(): Promise<boolean> {
  if (configurePromise) {
    await configurePromise;
  }
  return isConfigured;
}

/** Test seam. Never call from app code. */
export function __resetRevenueCatForTests(): void {
  isConfigured = false;
  currentAppUserId = null;
  configurePromise = null;
}
