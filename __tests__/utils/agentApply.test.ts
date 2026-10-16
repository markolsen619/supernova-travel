// __tests__/utils/agentApply.test.ts
import { planApply, orderAfter, applyRouteOps, undoSteps } from '@/utils/agentApply';
import type { TripWithDays } from '@/types';

const stop = (id: string, title: string, order: number, type = 'activity') =>
  ({ id, title, type, order, startTime: null, endTime: null, lat: 1, lng: 1, placeId: null, address: null, durationMinutes: null, notes: '', bookingRef: null, cost: null, currency: null, mediaUrls: [] }) as any;
const trip = {
  id: 'T', startDate: null, startDay: '2026-11-02',
  destination: { name: 'Lisbon', nights: 2 }, additionalDestinations: [{ name: 'Porto', nights: 2 }],
  days: [
    { id: 'D1', dayNumber: 1, destinationIndex: 0, activities: [stop('A', 'Belém Tower', 1000), stop('B', 'Oceanário', 2000)] },
    { id: 'D2', dayNumber: 2, destinationIndex: 0, activities: [stop('C', 'LX Factory', 1000)] },
    { id: 'D3', dayNumber: 3, destinationIndex: 1, activities: [] },
  ],
} as unknown as TripWithDays;

describe('orderAfter', () => {
  it('places between neighbours, first, or at the end', () => {
    const s = trip.days[0].activities;
    expect(orderAfter(s, 'A')).toBe(1500);
    expect(orderAfter(s, 'B')).toBe(3000);
    expect(orderAfter(s, null)).toBe(3000);
    expect(orderAfter([], null)).toBe(1000);
  });
});

describe('planApply', () => {
  it('orders removals, moves, updates, then additions; route kept apart', () => {
    const p = planApply(trip, [
      { kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: null, time: null },
      { kind: 'trip.setNights', city: 0, nights: 3 },
      { kind: 'trip.updateStop', dayId: 'D2', stopId: 'C', time: '10:00' },
      { kind: 'trip.moveStop', dayId: 'D1', stopId: 'A', toDayId: 'D2', afterStopId: null },
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
    ]);
    expect(p.steps.map((s) => s.do)).toEqual(['delete', 'move', 'update', 'add']);
    expect(p.routeOps.map((o) => o.kind)).toEqual(['trip.setNights']);
    expect(p.skipped).toEqual([]);
  });
  it('builds a new stop the way the background grounding expects', () => {
    const p = planApply(trip, [{ kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: 'C', time: null }]);
    const add = p.steps[0] as any;
    expect(add.activity).toMatchObject({ type: 'restaurant', title: 'Dinner at Ramiro', lat: null, lng: null, placeId: null, startTime: null, searchQuery: 'Dinner at Ramiro, Lisbon' });
    expect(add.activity.titleSource).toBeUndefined();
    expect(add.order).toBe(2000);
  });
  it('skips operations whose stop no longer exists', () => {
    const p = planApply(trip, [
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'GONE' },
      { kind: 'trip.addStop', dayId: 'D9', title: 'Somewhere', type: 'activity', afterStopId: null, time: null },
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
    ]);
    expect(p.steps).toHaveLength(1);
    expect(p.skipped).toHaveLength(2);
  });
  it('skips a reorder whose day changed since', () => {
    const p = planApply(trip, [{ kind: 'trip.reorderDay', dayId: 'D1', stopIds: ['B', 'A', 'X'] }]);
    expect(p.skipped).toHaveLength(1);
    const ok = planApply(trip, [{ kind: 'trip.reorderDay', dayId: 'D1', stopIds: ['B', 'A'] }]);
    expect((ok.steps[0] as any).after.map((a: any) => a.id)).toEqual(['B', 'A']);
  });
  it('records what an update replaces, for undo', () => {
    const p = planApply(trip, [{ kind: 'trip.updateStop', dayId: 'D1', stopId: 'A', time: '09:00', notes: 'Early' }]);
    expect(p.steps[0]).toMatchObject({ do: 'update', patch: { startTime: '09:00', notes: 'Early' }, before: { startTime: null, notes: '' } });
  });
});

describe('applyRouteOps', () => {
  const rows = [
    { key: '0', from: 0, nights: 2, absorbs: [], absorbsAfter: [], place: 'Lisbon' },
    { key: '1', from: 1, nights: 2, absorbs: [], absorbsAfter: [], place: 'Porto' },
  ];
  it('applies nights, moves, additions and removals by original city index', () => {
    const r = applyRouteOps(rows as any, [
      { kind: 'trip.setNights', city: 1, nights: 3 },
      { kind: 'trip.addCity', name: 'Sintra', nights: 1, afterCity: 0 },
      { kind: 'trip.moveCity', city: 1, by: -1 },
    ], (name) => name);
    // Sintra goes in after Lisbon ([Lisbon, Sintra, Porto]); then Porto moves one earlier.
    expect(r.rows.map((x: any) => x.place)).toEqual(['Lisbon', 'Porto', 'Sintra']);
    expect(r.rows.find((x: any) => x.place === 'Sintra')?.nights).toBeGreaterThanOrEqual(1);
    expect(r.skipped).toEqual([]);
  });
  it('skips a city it cannot place', () => {
    const r = applyRouteOps(rows as any, [{ kind: 'trip.addCity', name: 'Atlantis', nights: 1, afterCity: null }], () => null);
    expect(r.skipped).toHaveLength(1);
    expect(r.rows).toHaveLength(2);
  });
});

describe('undoSteps', () => {
  it('reverses each step in reverse order', () => {
    const p = planApply(trip, [
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
      { kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: null, time: null },
    ]);
    const u = undoSteps(p.steps, { 1: 'NEW1' });
    expect(u.map((s) => s.do)).toEqual(['delete', 'add']);
    expect((u[0] as any).activity.id).toBe('NEW1');
    expect((u[1] as any).activity.title).toBe('Oceanário');
    expect((u[1] as any).order).toBe(2000);
  });
});

// Review 2026-10-15: positions were computed from the trip as it was, so two new stops shared one
// order (dinner could render before lunch) and an addition after a reorder used stale numbers.
describe('planApply positions, in the order the steps run', () => {
  const orders = (p: ReturnType<typeof planApply>) => p.steps.map((s: any) => [s.do, s.activity?.title, s.order ?? null]);
  it('gives two new stops at the end increasing positions', () => {
    const p = planApply(trip, [
      { kind: 'trip.addStop', dayId: 'D2', title: 'Lunch', type: 'restaurant', afterStopId: null, time: null },
      { kind: 'trip.addStop', dayId: 'D2', title: 'Dinner', type: 'restaurant', afterStopId: null, time: null },
    ]);
    expect(orders(p)).toEqual([['add', 'Lunch', 2000], ['add', 'Dinner', 3000]]);
  });
  it('keeps several stops proposed after the same stop in their proposed order', () => {
    const p = planApply(trip, [
      { kind: 'trip.addStop', dayId: 'D1', title: 'Coffee', type: 'restaurant', afterStopId: 'A', time: null },
      { kind: 'trip.addStop', dayId: 'D1', title: 'Gelato', type: 'restaurant', afterStopId: 'A', time: null },
    ]);
    expect(orders(p)).toEqual([['add', 'Coffee', 1500], ['add', 'Gelato', 1750]]);
  });
  it('places an addition with the numbering a reorder in the same proposal writes', () => {
    const p = planApply(trip, [
      { kind: 'trip.reorderDay', dayId: 'D1', stopIds: ['B', 'A'] },
      { kind: 'trip.addStop', dayId: 'D1', title: 'Coffee', type: 'restaurant', afterStopId: 'B', time: null },
    ]);
    // reorderActivities writes idx * 1000: B=0, A=1000.
    expect(orders(p).find((x) => x[0] === 'add')).toEqual(['add', 'Coffee', 500]);
  });
  it('gives a moved stop a position on its new day, after earlier moves there', () => {
    const p = planApply(trip, [
      { kind: 'trip.moveStop', dayId: 'D1', stopId: 'A', toDayId: 'D2', afterStopId: null },
      { kind: 'trip.moveStop', dayId: 'D1', stopId: 'B', toDayId: 'D2', afterStopId: null },
    ]);
    expect(p.steps.map((s: any) => s.order)).toEqual([2000, 3000]);
  });
});

// Review 2026-10-15: shifting the start left the end where it was when nights weren't saved.
describe('planApply dates', () => {
  it('moves the end by the same number of days as the start', () => {
    const t = { ...trip, startDay: '2026-11-02', endDate: { toDate: () => new Date(2026, 10, 5) } } as any;
    const p = planApply(t, [{ kind: 'trip.shiftDates', newStart: '2026-11-04' }]);
    expect(p.steps[0]).toMatchObject({ do: 'dates', newStart: '2026-11-04', newEnd: '2026-11-07', previousStart: '2026-11-02', previousEnd: '2026-11-05' });
  });
  it('sets only the start when the trip has no end date', () => {
    const p = planApply({ ...trip, startDay: null, startDate: null, endDate: null } as any, [{ kind: 'trip.shiftDates', newStart: '2026-11-04' }]);
    expect(p.steps[0]).toMatchObject({ do: 'dates', newStart: '2026-11-04', newEnd: null });
  });
});
