// Relative path, not @/: functions/ is a separate npm package and
// quotaUtils.ts imports no firebase-admin, so it is testable here.
import {
  aiTripQuotaPolicy,
  getMonthStart,
  getNextMonthStart,
  getMonthlyQuotaKey,
} from '../../functions/src/quotaUtils';

const at = (iso: string) => new Date(iso);

describe('getMonthStart / getNextMonthStart', () => {
  it('returns the first of the current month at UTC midnight', () => {
    expect(getMonthStart(at('2026-09-25T18:42:11.000Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('is already the boundary on the first of the month', () => {
    expect(getMonthStart(at('2026-09-01T00:00:00.000Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('rolls into the next year from December', () => {
    expect(getNextMonthStart(at('2026-12-20T10:00:00.000Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('handles February without assuming 30 days', () => {
    // Adding 30 days to a month start is the obvious wrong implementation.
    expect(getNextMonthStart(at('2028-02-10T00:00:00.000Z')).toISOString()).toBe(
      '2028-03-01T00:00:00.000Z',
    );
  });
});

describe('getMonthlyQuotaKey', () => {
  it('namespaces by feature and month', () => {
    expect(getMonthlyQuotaKey('ai_trips', at('2026-09-25T00:00:00.000Z'))).toBe(
      'ai_trips_2026-09-01',
    );
  });

  it('gives two different months different keys', () => {
    expect(getMonthlyQuotaKey('ai_trips', at('2026-09-30T23:59:59.000Z'))).not.toBe(
      getMonthlyQuotaKey('ai_trips', at('2026-10-01T00:00:00.000Z')),
    );
  });
});

describe('aiTripQuotaPolicy', () => {
  const now = at('2026-09-25T12:00:00.000Z');

  it('gives a free account one trip per calendar month', () => {
    const policy = aiTripQuotaPolicy('free', now);
    expect(policy.limit).toBe(1);
    expect(policy.window).toBe('month');
    expect(policy.quotaKey).toBe('ai_trips_2026-09-01');
    expect(policy.resetsAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('gives a paid account one trip per calendar week', () => {
    const policy = aiTripQuotaPolicy('pro', now);
    expect(policy.limit).toBe(1);
    expect(policy.window).toBe('week');
    // Monday of the week containing Fri 2026-09-25.
    expect(policy.quotaKey).toBe('ai_trips_2026-09-21');
  });

  it('treats business the same as pro', () => {
    expect(aiTripQuotaPolicy('business', now).window).toBe('week');
  });

  it('treats a missing tier as free', () => {
    // createUserProfile omits `tier` for new accounts, so absent is the
    // ordinary shape of a free user rather than a broken document.
    expect(aiTripQuotaPolicy(undefined, now).window).toBe('month');
    expect(aiTripQuotaPolicy(null, now).window).toBe('month');
  });

  it('treats an unrecognised tier as free', () => {
    // Fail closed: a typo must not hand out the more generous window.
    expect(aiTripQuotaPolicy('platinum', now).window).toBe('month');
  });

  it('uses a different key for free and paid in the same moment', () => {
    // The windows must not share a counter, or upgrading mid-month would
    // arrive with the free tier's usage already spent against it.
    expect(aiTripQuotaPolicy('free', now).quotaKey).not.toBe(
      aiTripQuotaPolicy('pro', now).quotaKey,
    );
  });
});
