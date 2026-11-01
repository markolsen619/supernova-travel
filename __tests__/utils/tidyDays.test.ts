import { tidyPlan } from '@/utils/tidyDays';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const created = { toMillis: () => NOW - 60_000 };
const stop = (id: string, order: number, lat: number | null, lng: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, order, lat, lng, type: 'activity', title: `Stop ${id}`, startTime: null, searchQuery: `Stop ${id}, Lisbon`, groundingFailedAt: null, ...extra });
// A zig-zag day: west, east, west, east along one street.
const zigzag = [stop('a', 0, 38.71, -9.20), stop('b', 1000, 38.71, -9.10), stop('c', 2000, 38.71, -9.19), stop('d', 3000, 38.71, -9.11)];
const trip = (over: Record<string, unknown> = {}) => ({ isAiGenerated: true, daysTidied: false, createdAt: created, days: [{ id: 'd1', activities: zigzag }], ...over });

describe('tidyPlan (AI days ordered for the least travel once their stops are placed, owner 2026-10-30)', () => {
  it('a fresh AI trip with every stop placed: reorders the zig-zag day', () => {
    const p = tidyPlan(trip(), NOW);
    expect(p.ready).toBe(true);
    expect(p.reorders).toHaveLength(1);
    expect(p.reorders[0].dayId).toBe('d1');
    expect(p.reorders[0].ids).not.toEqual(['a', 'b', 'c', 'd']);
  });
  it('waits while a stop is still being placed', () => {
    const pending = trip({ days: [{ id: 'd1', activities: [...zigzag, stop('e', 4000, null, null)] }] });
    expect(tidyPlan(pending, NOW)).toEqual({ ready: false, reorders: [] });
  });
  it('a stop that could not be placed does not block it', () => {
    const failed = trip({ days: [{ id: 'd1', activities: [...zigzag, stop('e', 4000, null, null, { groundingFailedAt: { toMillis: () => NOW } })] }] });
    expect(tidyPlan(failed, NOW).ready).toBe(true);
  });
  it('never twice, never a hand-built trip, never an old trip (the person may have arranged it)', () => {
    expect(tidyPlan(trip({ daysTidied: true }), NOW).ready).toBe(false);
    expect(tidyPlan(trip({ isAiGenerated: false }), NOW).ready).toBe(false);
    expect(tidyPlan(trip({ createdAt: { toMillis: () => NOW - 3 * 86_400_000 } }), NOW).ready).toBe(false);
  });
  it('an already tidy day needs nothing (still ready, so it is marked done)', () => {
    const tidy = trip({ days: [{ id: 'd1', activities: [stop('a', 0, 38.71, -9.20), stop('b', 1000, 38.71, -9.19), stop('c', 2000, 38.71, -9.11)] }] });
    expect(tidyPlan(tidy, NOW)).toEqual({ ready: true, reorders: [] });
  });
});
