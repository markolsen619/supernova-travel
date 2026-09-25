jest.mock('@/services/firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }));

import { CACHE_TTL_MS, isCacheFresh, stripUndefined } from '@/services/places/placeCache';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-25T12:00:00.000Z');

describe('isCacheFresh', () => {
  it('accepts an entry written just now', () => {
    expect(isCacheFresh(NOW, NOW)).toBe(true);
  });

  it('accepts an entry inside the TTL', () => {
    expect(isCacheFresh(NOW - CACHE_TTL_MS + DAY, NOW)).toBe(true);
  });

  it('rejects an entry past the TTL', () => {
    expect(isCacheFresh(NOW - CACHE_TTL_MS - 1, NOW)).toBe(false);
  });

  it('rejects a missing timestamp', () => {
    // A document written before this field existed, or a partial write.
    // Treating it as fresh would pin bad data forever.
    expect(isCacheFresh(undefined, NOW)).toBe(false);
    expect(isCacheFresh(null, NOW)).toBe(false);
  });

  it('accepts a timestamp slightly in the future', () => {
    // Device clock skew against serverTimestamp. Refetching on skew would
    // spend a paid API call to fix a clock, which is the wrong trade.
    expect(isCacheFresh(NOW + 60_000, NOW)).toBe(true);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(isCacheFresh(Number.NaN, NOW)).toBe(false);
  });
});

describe('stripUndefined', () => {
  it('drops undefined values', () => {
    // Firestore rejects undefined outright, and tier2FieldsFromRaw returns
    // undefined for every field Google omitted — most places lack at least one.
    expect(stripUndefined({ rating: 4.5, priceLevel: undefined })).toEqual({ rating: 4.5 });
  });

  it('keeps null, zero, empty string and empty array', () => {
    // These are real values. primaryType is explicitly nulled by
    // tier2FieldsFromRaw, and a zero rating count is meaningful.
    expect(
      stripUndefined({ primaryType: null, userRatingCount: 0, summary: '', photoNames: [] }),
    ).toEqual({ primaryType: null, userRatingCount: 0, summary: '', photoNames: [] });
  });

  it('returns an empty object when everything is undefined', () => {
    expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
  });
});
