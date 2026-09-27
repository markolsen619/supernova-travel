import { normalizeAiTripQuota } from '@/utils/aiTripQuota';

describe('normalizeAiTripQuota', () => {
  it('passes the current response shape through untouched', () => {
    const current = {
      tier: 'pro' as const,
      limit: 40,
      remaining: 38,
      resetsAt: '2026-10-05T00:00:00.000Z',
      window: 'week' as const,
      fairUse: true,
    };
    expect(normalizeAiTripQuota(current)).toEqual(current);
  });

  it('reads a pre-fair-use paid response (nulls) as unlimited, not as zero left', () => {
    const q = normalizeAiTripQuota({ tier: 'pro', limit: null, remaining: null, resetsAt: null });
    expect(q.fairUse).toBe(true);
    expect(q.remaining).toBeGreaterThan(0);
  });

  it('reads a pre-fair-use free response as the weekly ration it was', () => {
    const q = normalizeAiTripQuota({
      tier: 'free',
      limit: 1,
      remaining: 0,
      resetsAt: '2026-09-28T00:00:00.000Z',
    });
    expect(q).toEqual({
      tier: 'free',
      limit: 1,
      remaining: 0,
      resetsAt: '2026-09-28T00:00:00.000Z',
      window: 'week',
      fairUse: false,
    });
  });
});
