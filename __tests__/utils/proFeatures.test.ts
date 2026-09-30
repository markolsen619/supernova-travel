import { FREE_WALLET_LIMIT, isPaidTier, walletAddAllowed } from '@/utils/proFeatures';

describe('isPaidTier', () => {
  it('treats pro and business as paid', () => {
    expect(isPaidTier('pro')).toBe(true);
    expect(isPaidTier('business')).toBe(true);
    expect(isPaidTier('free')).toBe(false);
    expect(isPaidTier(undefined)).toBe(false);
  });
});

describe('walletAddAllowed', () => {
  it('gives a free traveler two items in total', () => {
    expect(FREE_WALLET_LIMIT).toBe(2);
    expect(walletAddAllowed('free', 0)).toBe(true);
    expect(walletAddAllowed('free', 1)).toBe(true);
    expect(walletAddAllowed('free', 2)).toBe(false);
  });

  it('never limits Pro', () => {
    expect(walletAddAllowed('pro', 250)).toBe(true);
  });

  it('keeps a free traveler over the limit (from before it existed) blocked from adding, not stripped', () => {
    // Items saved before the limit stay; only adding is gated.
    expect(walletAddAllowed('free', 9)).toBe(false);
  });
});
