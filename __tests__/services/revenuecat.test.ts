import type { CustomerInfo } from 'react-native-purchases';
import {
  tierFromCustomerInfo,
  isProActive,
  isLifetimeUnlock,
  proExpirationDate,
  isExpiringSoon,
  isTestStoreKey,
} from '@/services/revenuecat';

// Minimal CustomerInfo — only the entitlement fields these helpers read.
function info(
  active: Record<string, { expirationDate: string | null; willRenew: boolean }>,
): CustomerInfo {
  return { entitlements: { active } } as unknown as CustomerInfo;
}

const PRO = 'supernova_pro';

describe('tierFromCustomerInfo', () => {
  it('maps an active supernova_pro entitlement to the pro tier', () => {
    expect(tierFromCustomerInfo(info({ [PRO]: { expirationDate: null, willRenew: true } }))).toBe('pro');
  });

  it('returns free when no entitlements are active', () => {
    expect(tierFromCustomerInfo(info({}))).toBe('free');
  });

  it('returns free for null customer info', () => {
    expect(tierFromCustomerInfo(null)).toBe('free');
  });

  it('ignores an unrelated entitlement', () => {
    expect(tierFromCustomerInfo(info({ some_other: { expirationDate: null, willRenew: true } }))).toBe(
      'free',
    );
  });
});

describe('isProActive', () => {
  it('is true only when the pro entitlement is present', () => {
    expect(isProActive(info({ [PRO]: { expirationDate: null, willRenew: true } }))).toBe(true);
    expect(isProActive(info({}))).toBe(false);
    expect(isProActive(null)).toBe(false);
  });
});

describe('isLifetimeUnlock', () => {
  it('is true when the entitlement has no expiry', () => {
    expect(isLifetimeUnlock(info({ [PRO]: { expirationDate: null, willRenew: false } }))).toBe(true);
  });

  it('is false for a dated subscription', () => {
    expect(
      isLifetimeUnlock(info({ [PRO]: { expirationDate: '2027-01-01T00:00:00Z', willRenew: true } })),
    ).toBe(false);
  });

  it('is false when nothing is active', () => {
    expect(isLifetimeUnlock(info({}))).toBe(false);
  });
});

describe('proExpirationDate', () => {
  it('returns the expiry for a subscription', () => {
    expect(
      proExpirationDate(info({ [PRO]: { expirationDate: '2027-01-01T00:00:00Z', willRenew: true } })),
    ).toBe('2027-01-01T00:00:00Z');
  });

  it('returns null for lifetime and for free', () => {
    expect(proExpirationDate(info({ [PRO]: { expirationDate: null, willRenew: false } }))).toBeNull();
    expect(proExpirationDate(info({}))).toBeNull();
  });
});

describe('isExpiringSoon', () => {
  it('is true for an active subscription with auto-renew off', () => {
    expect(
      isExpiringSoon(info({ [PRO]: { expirationDate: '2027-01-01T00:00:00Z', willRenew: false } })),
    ).toBe(true);
  });

  it('is false while it is still renewing', () => {
    expect(
      isExpiringSoon(info({ [PRO]: { expirationDate: '2027-01-01T00:00:00Z', willRenew: true } })),
    ).toBe(false);
  });

  it('is false for lifetime, which cannot lapse', () => {
    expect(isExpiringSoon(info({ [PRO]: { expirationDate: null, willRenew: false } }))).toBe(false);
  });
});

describe('isTestStoreKey', () => {
  it('recognises a Test Store key', () => {
    expect(isTestStoreKey('test_exampleKeyNotARealCredential')).toBe(true);
  });

  it('rejects real platform keys, which must never be mistaken for test keys', () => {
    expect(isTestStoreKey('appl_abc123')).toBe(false);
    expect(isTestStoreKey('goog_abc123')).toBe(false);
    expect(isTestStoreKey('')).toBe(false);
  });
});
