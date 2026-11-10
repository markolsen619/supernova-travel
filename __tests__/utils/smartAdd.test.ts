import { placementInDay, smartAddBanner, smartPlacement } from '@/utils/smartAdd';

const act = (id: string, title: string, lat: number | null, lng: number | null, order: number, extra: Record<string, unknown> = {}) =>
  ({ id, title, type: 'activity', lat, lng, order, startTime: null, ...extra });
const day = (id: string, dayNumber: number, destinationIndex: number | null, activities: ReturnType<typeof act>[]) =>
  ({ id, dayNumber, destinationIndex, date: null, title: '', notes: '', activities });
// Budapest: Castle District ~47.50,19.03; Pest centre ~47.497,19.054; Christmas market (Vörösmarty) ~47.4965,19.0510
const trip = (days: ReturnType<typeof day>[], startDay: string | null = '2026-11-18') =>
  ({ id: 't', title: 'T', startDay, startDate: null, days, destination: { name: 'Prague' }, additionalDestinations: [{ name: 'Budapest' }] }) as never;
const market = { lat: 47.4965, lng: 19.051, title: 'Budapest Christmas markets' };

describe('smartPlacement (spec 2026-11-10 §2)', () => {
  it('picks the city day where the place adds the least distance, at its best spot', () => {
    const t = trip([
      day('p1', 1, 0, [act('a', 'Old Town', 50.087, 14.421, 1000)]),
      day('b1', 5, 1, [act('c', 'Buda Castle', 47.496, 19.04, 1000), act('d', 'Fisherman\'s Bastion', 47.502, 19.035, 2000)]),
      day('b2', 6, 1, [act('e', 'Parliament', 47.507, 19.046, 1000), act('f', 'Vörösmarty Square', 47.4966, 19.0508, 2000)]),
    ]);
    const r = smartPlacement(t, [0, 1, 1], 1, market, '2026-11-10');
    expect(r).toMatchObject({ dayId: 'b2', dayNumber: 6, cityIndex: 1, afterTitle: 'Vörösmarty Square' });
    expect(r!.order).toBeGreaterThan(2000);
  });
  it('lands between two stops with a midpoint order (one write, no renumbering)', () => {
    const t = trip([day('b1', 5, 1, [act('a', 'North', 47.51, 19.05, 1000), act('b', 'South', 47.48, 19.05, 2000)])]);
    const r = smartPlacement(t, [1], 1, market, '2026-11-10')!;
    expect(r.afterTitle).toBe('North');
    expect(r.order).toBe(1500);
  });
  it('keeps timed and booked stops fixed', () => {
    const t = trip([day('b1', 5, 1, [act('a', 'Lunch', 47.4966, 19.0508, 1000, { startTime: '12:00' }), act('b', 'Far', 47.53, 19.08, 2000)])]);
    expect(smartPlacement(t, [1], 1, market, '2026-11-10')).not.toBeNull();
  });
  it('does not let an empty day win over a day with stops nearby (review focus 3)', () => {
    const t = trip([day('b1', 5, 1, []), day('b2', 6, 1, [act('a', 'Vörösmarty Square', 47.4966, 19.0508, 1000)])]);
    expect(smartPlacement(t, [1, 1], 1, market, '2026-11-10')!.dayId).toBe('b2');
  });
  it('when every city day is empty, picks the first day that is not the departure day', () => {
    const t = trip([day('b1', 5, 1, []), day('b2', 6, 1, []), day('b3', 7, 1, []), day('v1', 8, 2, [])]);
    expect(smartPlacement(t, [1, 1, 1, 2], 1, market, '2026-11-10')!.dayId).toBe('b1');
    const lastCity = trip([day('v1', 7, 2, []), day('v2', 8, 2, [])]);
    expect(smartPlacement(lastCity, [2, 2], 2, market, '2026-11-10')!.dayId).toBe('v1');
  });
  it('a single-day city uses that day', () => {
    const t = trip([day('b1', 5, 1, []), day('v1', 6, 2, [])]);
    expect(smartPlacement(t, [1, 2], 1, market, '2026-11-10')!.dayId).toBe('b1');
  });
  it('drops days already past on a trip under way', () => {
    const t = trip([day('b1', 1, 1, [act('a', 'Here', 47.4966, 19.0508, 1000)]), day('b2', 2, 1, [act('b', 'There', 47.51, 19.06, 1000)])], '2026-11-18');
    expect(smartPlacement(t, [1, 1], 1, market, '2026-11-19')!.dayId).toBe('b2');
    expect(smartPlacement(t, [1, 1], 1, market, '2026-11-25')).toBeNull();
  });
  it('keeps every day on an undated trip (review focus 1)', () => {
    const t = trip([day('b1', 1, 1, [act('a', 'Here', 47.4966, 19.0508, 1000)])], null);
    expect(smartPlacement(t, [1], 1, market, '2030-01-01')!.dayId).toBe('b1');
  });
  it('finds city days from the resolved dayCities, not the raw destinationIndex (review focus 2)', () => {
    const t = trip([day('d1', 1, null, [act('a', 'Here', 47.4966, 19.0508, 1000)])]);
    expect(smartPlacement(t, [0], 0, market, '2026-11-10')!.dayId).toBe('d1');
  });
  it('null when the city has no days, or the place has no position', () => {
    const t = trip([day('p1', 1, 0, [])]);
    expect(smartPlacement(t, [0], 1, market, '2026-11-10')).toBeNull();
    expect(smartPlacement(t, [0], 0, { lat: null, lng: null, title: 'x' }, '2026-11-10')).toBeNull();
  });
});

describe('placementInDay (Change day)', () => {
  it('puts the place at the best spot of the chosen day', () => {
    const d = day('b1', 5, 1, [act('a', 'North', 47.51, 19.05, 1000), act('b', 'South', 47.48, 19.05, 2000)]);
    expect(placementInDay(d as never, market)).toEqual({ order: 1500, afterTitle: 'North' });
    expect(placementInDay(day('e', 1, 1, []) as never, market)).toEqual({ order: 1000, afterTitle: null });
  });
});

describe('smartAddBanner', () => {
  it('names the day, city and the stop before it', () => {
    expect(smartAddBanner({ dayNumber: 6, city: 'Budapest', afterTitle: "Fisherman's Bastion", multiCity: true })).toBe("Added to Day 6 · Budapest, after Fisherman's Bastion");
    expect(smartAddBanner({ dayNumber: 6, city: 'Budapest', afterTitle: null, multiCity: true })).toBe('Added as the first stop of Day 6 · Budapest');
    expect(smartAddBanner({ dayNumber: 2, city: 'Lisbon', afterTitle: 'Alfama', multiCity: false })).toBe('Added to Day 2, after Alfama');
  });
});

import { orderAt } from '@/utils/agentApply';
describe('first-stop order (final review I3: AI days start at order 0, and 0/2 tied with the first stop)', () => {
  it('goes strictly before the first stop, even at order 0', () => {
    expect(orderAt([{ order: 0 }, { order: 1000 }], 0)).toBeLessThan(0);
    const d = { id: 'd', dayNumber: 1, destinationIndex: 1, date: null, title: '', notes: '', activities: [
      { id: 'a', title: 'Vörösmarty Square', type: 'activity', lat: 47.4966, lng: 19.0508, order: 0, startTime: null },
      { id: 'b', title: 'Far east', type: 'activity', lat: 47.50, lng: 19.20, order: 1000, startTime: null },
    ] };
    const r = placementInDay(d as never, { lat: 47.4960, lng: 19.0300, title: 'West of both' });
    expect(r.afterTitle).toBeNull();
    expect(r.order).toBeLessThan(0);
  });
});

import { moveSmartAdd, undoSmartAdd } from '@/utils/smartAddFlow';
describe('Change day / Undo failure paths (final review I2: silent failures left trip and wish list out of step)', () => {
  const fakes = (fail: { del?: boolean; write?: boolean } = {}) => {
    const calls: string[] = [];
    return { calls, deps: {
      deleteStop: async () => { calls.push('delete'); if (fail.del) throw new Error('x'); },
      writeStop: async () => { calls.push('write'); if (fail.write) throw new Error('x'); return 'new1'; },
      clearAdded: async () => { calls.push('clear'); },
    } };
  };
  it('undo: deletes then clears the mark', async () => {
    const f = fakes();
    expect(await undoSmartAdd(f.deps)).toBe('undone');
    expect(f.calls).toEqual(['delete', 'clear']);
  });
  it('undo: a failed delete keeps the mark (the stop is still on the trip)', async () => {
    const f = fakes({ del: true });
    expect(await undoSmartAdd(f.deps)).toBe('failed');
    expect(f.calls).toEqual(['delete']);
  });
  it('move: deletes, then writes on the new day', async () => {
    const f = fakes();
    expect(await moveSmartAdd(f.deps)).toEqual({ status: 'moved', activityId: 'new1' });
    expect(f.calls).toEqual(['delete', 'write']);
  });
  it('move: a failed delete writes nothing (no second copy)', async () => {
    const f = fakes({ del: true });
    expect(await moveSmartAdd(f.deps)).toEqual({ status: 'failed' });
    expect(f.calls).toEqual(['delete']);
  });
  it('move: a failed write after the delete clears the mark (the wish list tells the truth)', async () => {
    const f = fakes({ write: true });
    expect(await moveSmartAdd(f.deps)).toEqual({ status: 'lost' });
    expect(f.calls).toEqual(['delete', 'write', 'clear']);
  });
});
