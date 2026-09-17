import { shouldReconcileTier, resolveLimitPaywallAction } from '@/utils/tierSync';

describe('shouldReconcileTier', () => {
  it('reconciles when the SDK says pro but the server still says free', () => {
    expect(shouldReconcileTier('pro', 'free')).toBe(true);
  });

  it('reconciles the other way too — a lapse whose EXPIRATION webhook was lost', () => {
    expect(shouldReconcileTier('free', 'pro')).toBe(true);
  });

  it('does nothing when they agree', () => {
    expect(shouldReconcileTier('pro', 'pro')).toBe(false);
    expect(shouldReconcileTier('free', 'free')).toBe(false);
  });

  it('does nothing before a profile has been read, e.g. a listener event after sign-out', () => {
    expect(shouldReconcileTier('pro', null)).toBe(false);
  });
});

describe('resolveLimitPaywallAction', () => {
  it('refreshes after a purchase or restore', () => {
    expect(resolveLimitPaywallAction('purchased')).toBe('refresh');
    expect(resolveLimitPaywallAction('restored')).toBe('refresh');
  });

  it('refreshes when already pro — the server refused a user the SDK says has paid', () => {
    expect(resolveLimitPaywallAction('not_presented')).toBe('refresh');
  });

  it('just closes when the user declines', () => {
    expect(resolveLimitPaywallAction('cancelled')).toBe('close');
  });

  it('falls back to the app storefront when the hosted paywall cannot show', () => {
    expect(resolveLimitPaywallAction('unavailable')).toBe('storefront');
    expect(resolveLimitPaywallAction('error')).toBe('storefront');
  });
});
