// __tests__/functions/agentTripOps.test.ts
import { validateTripOps, MAX_OPERATIONS } from '../../functions/src/agentTripOps';
import { filterByCapabilities, isAgentSurface, threadId } from '../../functions/src/agentSurfaces';
import type { LabelMap } from '../../functions/src/agentTripContext';

const labels: LabelMap = {
  days: { d1: 'D1', d2: 'D2' },
  stops: { s1: { dayId: 'D1', stopId: 'A' }, s2: { dayId: 'D1', stopId: 'B' }, s3: { dayId: 'D2', stopId: 'C' } },
  dayStops: { D1: ['A', 'B'], D2: ['C'] },
  cityCount: 2,
};

describe('validateTripOps', () => {
  it('maps labels to ids for every operation kind', () => {
    const { ops, dropped } = validateTripOps([
      { op: 'addStop', day: 'd2', title: 'Dinner at Ramiro', type: 'restaurant', after: 's3', time: '20:00' },
      { op: 'removeStop', stop: 's2' },
      { op: 'moveStop', stop: 's1', toDay: 'd2', after: null },
      { op: 'updateStop', stop: 's3', time: null, note: 'Go early' },
      { op: 'setNights', city: 'c2', nights: 3 },
      { op: 'addCity', name: 'Sintra', nights: 1, after: 'c1' },
      { op: 'moveCity', city: 'c2', by: -1 },
      { op: 'shiftDates', newStart: '2026-11-04' },
    ], labels);
    expect(dropped).toBe(0);
    expect(ops).toEqual([
      { kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: 'C', time: '20:00' },
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
      { kind: 'trip.moveStop', dayId: 'D1', stopId: 'A', toDayId: 'D2', afterStopId: null },
      { kind: 'trip.updateStop', dayId: 'D2', stopId: 'C', time: null, notes: 'Go early' },
      { kind: 'trip.setNights', city: 1, nights: 3 },
      { kind: 'trip.addCity', name: 'Sintra', nights: 1, afterCity: 0 },
      { kind: 'trip.moveCity', city: 1, by: -1 },
      { kind: 'trip.shiftDates', newStart: '2026-11-04' },
    ]);
  });
  it('accepts a reorder only when it lists exactly that day\'s stops', () => {
    expect(validateTripOps([{ op: 'reorderDay', day: 'd1', stops: ['s2', 's1'] }], labels).ops)
      .toEqual([{ kind: 'trip.reorderDay', dayId: 'D1', stopIds: ['B', 'A'] }]);
    expect(validateTripOps([{ op: 'reorderDay', day: 'd1', stops: ['s2'] }], labels).dropped).toBe(1);
    expect(validateTripOps([{ op: 'reorderDay', day: 'd1', stops: ['s2', 's3'] }], labels).dropped).toBe(1);
  });
  it('drops unknown labels, bad times, bad dates and unknown kinds', () => {
    const r = validateTripOps([
      { op: 'removeStop', stop: 's9' },
      { op: 'addStop', day: 'd7', title: 'X marks', type: 'activity' },
      { op: 'updateStop', stop: 's1', time: '25:00' },
      { op: 'shiftDates', newStart: '2026-13-40' },
      { op: 'bookFlight' },
      { op: 'setNights', city: 'c5', nights: 2 },
      { op: 'setNights', city: 'c1', nights: 0 },
    ], labels);
    expect(r.ops).toEqual([]);
    expect(r.dropped).toBe(7);
  });
  it('drops a second operation on the same stop', () => {
    const r = validateTripOps([{ op: 'moveStop', stop: 's1', toDay: 'd2' }, { op: 'removeStop', stop: 's1' }], labels);
    expect(r.ops.map((o) => o.kind)).toEqual(['trip.moveStop']);
    expect(r.dropped).toBe(1);
  });
  it('never removes the only city, and keeps the after-stop on the target day', () => {
    const one: LabelMap = { ...labels, cityCount: 1 };
    expect(validateTripOps([{ op: 'removeCity', city: 'c1', mode: 'delete' }], one).dropped).toBe(1);
    expect(validateTripOps([{ op: 'addStop', day: 'd1', title: 'Coffee', type: 'restaurant', after: 's3' }], labels).ops[0])
      .toMatchObject({ afterStopId: null });
  });
  it('cleans titles and types', () => {
    const r = validateTripOps([{ op: 'addStop', day: 'd1', title: '  Miradouro da Senhora do Monte  ', type: 'viewpoint' }], labels);
    expect(r.ops[0]).toMatchObject({ title: 'Miradouro da Senhora do Monte', type: 'activity', time: null });
    expect(validateTripOps([{ op: 'addStop', day: 'd1', title: '', type: 'activity' }], labels).dropped).toBe(1);
    expect(validateTripOps([{ op: 'addStop', day: 'd1', title: 'x'.repeat(81), type: 'activity' }], labels).dropped).toBe(1);
  });
  it(`keeps at most ${MAX_OPERATIONS} operations`, () => {
    const many = Array.from({ length: 15 }, () => ({ op: 'addStop', day: 'd1', title: 'Gelato stop', type: 'restaurant' }));
    const r = validateTripOps(many, labels);
    expect(r.ops).toHaveLength(MAX_OPERATIONS);
    expect(r.dropped).toBe(3);
  });
  it('survives garbage', () => {
    expect(validateTripOps(null, labels)).toEqual({ ops: [], dropped: 0 });
    expect(validateTripOps('nope', labels)).toEqual({ ops: [], dropped: 0 });
    expect(validateTripOps([42, null], labels)).toEqual({ ops: [], dropped: 2 });
  });
});

describe('filterByCapabilities', () => {
  const ops = validateTripOps([{ op: 'removeStop', stop: 's1' }], labels).ops;
  it('returns operations the app declared it can apply', () => {
    expect(filterByCapabilities(ops, ['trip.v1'])).toEqual(ops);
  });
  it('returns nothing to an app that declared nothing (an older or different build)', () => {
    expect(filterByCapabilities(ops, [])).toEqual([]);
    expect(filterByCapabilities(ops, undefined)).toEqual([]);
    expect(filterByCapabilities(ops, ['wallet.v1'])).toEqual([]);
  });
});

describe('surfaces', () => {
  it('knows only the trip surface in phase 1', () => {
    expect(isAgentSurface('trip')).toBe(true);
    expect(isAgentSurface('wallet')).toBe(false);
    expect(isAgentSurface(undefined)).toBe(false);
  });
  it('names a thread by surface and subject', () => {
    expect(threadId('trip', 'abc123')).toBe('trip_abc123');
  });
});
