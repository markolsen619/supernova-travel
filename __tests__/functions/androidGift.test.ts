// __tests__/functions/androidGift.test.ts
import {
  androidGiftDecision,
  androidGiftEndMs,
  ANDROID_GIFT_CAP,
  ANDROID_GIFT_DAYS,
  ANDROID_LAUNCH_MS,
} from '../../functions/src/androidGift';

const base = {
  accountCreatedMs: ANDROID_LAUNCH_MS + 60_000,
  alreadyClaimed: false,
  hasPro: false,
  grantedCount: 0,
};

describe('androidGiftDecision', () => {
  it('grants a new account while places are left', () => {
    expect(androidGiftDecision(base)).toBe('grant');
    expect(androidGiftDecision({ ...base, grantedCount: ANDROID_GIFT_CAP - 1 })).toBe('grant');
  });
  it('stops at the cap', () => {
    expect(ANDROID_GIFT_CAP).toBe(10);
    expect(androidGiftDecision({ ...base, grantedCount: ANDROID_GIFT_CAP })).toBe('full');
  });
  it('never gives an account two years', () => {
    expect(androidGiftDecision({ ...base, alreadyClaimed: true })).toBe('already');
  });
  it('skips accounts that already have Pro, without using a place', () => {
    expect(androidGiftDecision({ ...base, hasPro: true })).toBe('has_pro');
  });
  it('only counts accounts made since the Play launch', () => {
    expect(androidGiftDecision({ ...base, accountCreatedMs: ANDROID_LAUNCH_MS - 1 })).toBe('not_new');
    expect(androidGiftDecision({ ...base, accountCreatedMs: NaN })).toBe('not_new');
  });
  it('an account that already claimed reads as already even once the offer is full', () => {
    expect(androidGiftDecision({ ...base, alreadyClaimed: true, grantedCount: ANDROID_GIFT_CAP })).toBe('already');
  });
});

describe('androidGiftEndMs', () => {
  it('is a year from the grant', () => {
    expect(ANDROID_GIFT_DAYS).toBe(365);
    expect(androidGiftEndMs(1_000)).toBe(1_000 + 365 * 24 * 60 * 60 * 1000);
  });
});
