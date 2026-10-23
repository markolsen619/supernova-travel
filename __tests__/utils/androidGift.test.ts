// __tests__/utils/androidGift.test.ts
import { shouldClaimAndroidGift, isSettledGiftAnswer, giftEndLabel } from '@/utils/androidGift';

describe('shouldClaimAndroidGift', () => {
  const base = { platform: 'android', tier: 'free', checked: false } as const;
  it('asks once, on Android, for a free account', () => {
    expect(shouldClaimAndroidGift(base)).toBe(true);
  });
  it('never asks on iPhone', () => {
    expect(shouldClaimAndroidGift({ ...base, platform: 'ios' })).toBe(false);
  });
  it('skips accounts that already have Pro', () => {
    expect(shouldClaimAndroidGift({ ...base, tier: 'pro' })).toBe(false);
  });
  it('does not ask again once answered', () => {
    expect(shouldClaimAndroidGift({ ...base, checked: true })).toBe(false);
  });
});

describe('isSettledGiftAnswer', () => {
  it('remembers every answer the server gives', () => {
    for (const s of ['grant', 'already', 'not_new', 'full', 'has_pro']) expect(isSettledGiftAnswer(s)).toBe(true);
  });
  it('anything unknown is asked again next launch', () => {
    expect(isSettledGiftAnswer('weird')).toBe(false);
    expect(isSettledGiftAnswer(undefined)).toBe(false);
  });
});

describe('giftEndLabel', () => {
  it('names the day the free year ends', () => {
    expect(giftEndLabel(Date.UTC(2027, 9, 23, 18))).toBe('October 23, 2027');
  });
});
