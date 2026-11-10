import { cleanVideoIds, coverExpiry, coverStillGood } from '../../functions/src/wishCovers';

const NOW = Date.parse('2026-11-10T12:00:00Z');

describe('cleanVideoIds (review focus 4: junk is dropped, never fetched)', () => {
  it('keeps unique digit ids, at most 30', () => {
    const many = Array.from({ length: 40 }, (_, i) => String(7000000000000000000n + BigInt(i)));
    expect(cleanVideoIds(many)).toHaveLength(30);
    expect(cleanVideoIds(['7705372432684551446', '7705372432684551446', 'abc', '12', 42, null, '../x'])).toEqual(['7705372432684551446']);
    expect(cleanVideoIds('7705372432684551446')).toEqual([]);
  });
});

describe('coverExpiry', () => {
  it('reads x-expires in seconds', () => {
    const exp = Math.floor(NOW / 1000) + 3 * 86400;
    expect(coverExpiry(`https://p16.tiktokcdn-us.com/c.jpeg?x-expires=${exp}&x-signature=a`, NOW)).toBe(exp * 1000);
  });
  it('falls back to a day when missing or garbage', () => {
    expect(coverExpiry('https://p16.tiktokcdn-us.com/c.jpeg', NOW)).toBe(NOW + 86_400_000);
    expect(coverExpiry('https://p16.tiktokcdn-us.com/c.jpeg?x-expires=soon', NOW)).toBe(NOW + 86_400_000);
    expect(coverExpiry('not a url', NOW)).toBe(NOW + 86_400_000);
  });
  it('caps at 14 days', () => {
    expect(coverExpiry(`https://p16.tiktokcdn-us.com/c.jpeg?x-expires=${Math.floor(NOW / 1000) + 90 * 86400}`, NOW)).toBe(NOW + 14 * 86_400_000);
  });
});

describe('coverStillGood (review focus 5: expired or nearly expired links are refetched)', () => {
  it('serves a link with more than an hour left', () => {
    expect(coverStillGood({ url: 'https://x/c.jpg', expiresMs: NOW + 2 * 3_600_000 }, NOW)).toBe(true);
  });
  it('refetches within the hour, after expiry, or when malformed', () => {
    expect(coverStillGood({ url: 'https://x/c.jpg', expiresMs: NOW + 30 * 60_000 }, NOW)).toBe(false);
    expect(coverStillGood({ url: 'https://x/c.jpg', expiresMs: NOW - 1 }, NOW)).toBe(false);
    expect(coverStillGood({ url: 'http://x/c.jpg', expiresMs: NOW + 9e9 }, NOW)).toBe(false);
    expect(coverStillGood(null, NOW)).toBe(false);
  });
});
