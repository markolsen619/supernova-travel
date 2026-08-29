// Reached by relative path, not the @/ alias: functions/ is a separate npm
// package with its own tsconfig, and tierEvents.ts is deliberately free of
// firebase-admin imports so it can be tested here at all.
import {
  isAnonymousAppUserId,
  affectsProEntitlement,
  resolveTierForEvent,
  shouldApplyEvent,
  RevenueCatEvent,
} from '../../functions/src/tierEvents';

const NOW = Date.parse('2026-08-27T12:00:00Z');
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const PAST = NOW - 24 * 60 * 60 * 1000;

function event(over: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: 'INITIAL_PURCHASE',
    app_user_id: 'firebase-uid-123',
    entitlement_ids: ['supernova_pro'],
    expiration_at_ms: FUTURE,
    event_timestamp_ms: NOW,
    ...over,
  };
}

describe('isAnonymousAppUserId', () => {
  it('flags RevenueCat anonymous ids, which have no user document', () => {
    expect(isAnonymousAppUserId('$RCAnonymousID:9f8c')).toBe(true);
  });

  it('treats a Firebase uid as real', () => {
    expect(isAnonymousAppUserId('firebase-uid-123')).toBe(false);
  });

  it('treats missing ids as anonymous rather than throwing', () => {
    expect(isAnonymousAppUserId(undefined)).toBe(true);
    expect(isAnonymousAppUserId('')).toBe(true);
  });
});

describe('affectsProEntitlement', () => {
  it('is true when the pro entitlement is named', () => {
    expect(affectsProEntitlement(event())).toBe(true);
  });

  it('is false for another entitlement', () => {
    expect(affectsProEntitlement(event({ entitlement_ids: ['some_other'] }))).toBe(false);
  });

  it('is false when the event carries no entitlements', () => {
    expect(affectsProEntitlement(event({ entitlement_ids: null }))).toBe(false);
  });

  it('is true for TRANSFER, which names no entitlements but moves them all', () => {
    expect(affectsProEntitlement(event({ type: 'TRANSFER', entitlement_ids: null }))).toBe(true);
  });
});

describe('resolveTierForEvent', () => {
  it('grants pro on an initial purchase', () => {
    expect(resolveTierForEvent(event(), NOW)).toBe('pro');
  });

  it('grants pro on a renewal', () => {
    expect(resolveTierForEvent(event({ type: 'RENEWAL' }), NOW)).toBe('pro');
  });

  it('grants pro for a lifetime purchase, which has no expiry', () => {
    expect(
      resolveTierForEvent(
        event({ type: 'NON_RENEWING_PURCHASE', expiration_at_ms: null }),
        NOW,
      ),
    ).toBe('pro');
  });

  it('revokes on EXPIRATION', () => {
    expect(resolveTierForEvent(event({ type: 'EXPIRATION', expiration_at_ms: PAST }), NOW)).toBe('free');
  });

  // The subtle one: cancelling turns off auto-renew, it does not end access.
  it('KEEPS pro on CANCELLATION while the paid period still has time left', () => {
    expect(
      resolveTierForEvent(
        event({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: FUTURE }),
        NOW,
      ),
    ).toBe('pro');
  });

  it('revokes on a refund, which back-dates the expiry', () => {
    expect(
      resolveTierForEvent(
        event({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: PAST }),
        NOW,
      ),
    ).toBe('free');
  });

  // Billing issues open a grace period; EXPIRATION follows if unresolved.
  it('KEEPS pro during a billing-issue grace period', () => {
    expect(
      resolveTierForEvent(event({ type: 'BILLING_ISSUE', expiration_at_ms: FUTURE }), NOW),
    ).toBe('pro');
  });

  it('restores pro on UNCANCELLATION', () => {
    expect(resolveTierForEvent(event({ type: 'UNCANCELLATION' }), NOW)).toBe('pro');
  });

  it('grants pro on a product change to another pro plan', () => {
    expect(resolveTierForEvent(event({ type: 'PRODUCT_CHANGE' }), NOW)).toBe('pro');
  });

  it('returns null for an event about a different entitlement', () => {
    expect(resolveTierForEvent(event({ entitlement_ids: ['other'] }), NOW)).toBeNull();
  });

  it('returns null for a purchase that grants no entitlement', () => {
    expect(resolveTierForEvent(event({ entitlement_ids: [] }), NOW)).toBeNull();
  });
});

describe('shouldApplyEvent', () => {
  it('applies the first event a user has ever received', () => {
    expect(shouldApplyEvent(NOW, undefined)).toBe(true);
    expect(shouldApplyEvent(NOW, null)).toBe(true);
  });

  it('applies a newer event', () => {
    expect(shouldApplyEvent(NOW, PAST)).toBe(true);
  });

  // RevenueCat retries at-least-once with no ordering guarantee, so a delayed
  // RENEWAL can arrive after the EXPIRATION that supersedes it.
  it('drops an event older than the last one applied', () => {
    expect(shouldApplyEvent(PAST, NOW)).toBe(false);
  });

  it('applies a redelivery with the same timestamp, so retries still settle', () => {
    expect(shouldApplyEvent(NOW, NOW)).toBe(true);
  });

  it('applies an event with no timestamp rather than dropping it', () => {
    expect(shouldApplyEvent(undefined, NOW)).toBe(true);
  });
});
