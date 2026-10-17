import { findingText, greeting, tripCheck } from '@/utils/tripCheck';

const a = (id: string, title: string, order: number, lat: number | null, lng: number | null, extra = {}) =>
  ({ id, title, order, lat, lng, type: 'activity', startTime: null, ...extra }) as never;
const trip = (activities: unknown[]) => ({
  id: 'T', destination: { name: 'Mission Beach', lat: 32.77, lng: -117.25 }, additionalDestinations: [],
  days: [{ id: 'D2', dayNumber: 2, destinationIndex: 0, activities }],
}) as never;

describe('tripCheck', () => {
  it('finds the owner\'s zig-zag Day 2', () => {
    const f = tripCheck(trip([a('t', 'Torrey', 1, 32.921, -117.251), a('m', 'Museum', 2, 32.732, -117.150), a('c', 'Taco Stand', 3, 32.839, -117.277), a('o', 'Ocean Beach', 4, 32.747, -117.252), a('l', 'La Jolla Cove', 5, 32.850, -117.273)]));
    expect(f[0]).toMatchObject({ kind: 'zigzag', dayNumber: 2 });
  });
  it('ignores small savings (< 3 km) and days with < 3 placed stops', () => {
    expect(tripCheck(trip([a('a', 'A', 1, 32.77, -117.25), a('b', 'B', 2, 32.771, -117.251), a('c', 'C', 3, 32.772, -117.25)]))).toEqual([]);
    expect(tripCheck(trip([a('a', 'A', 1, 32.92, -117.25), a('b', 'B', 2, 32.73, -117.15)]))).toEqual([]);
  });
  it('flags a stop more than 25 km from the city', () => {
    const f = tripCheck(trip([a('p', 'Drinks at Pennant', 1, 33.20, -117.05)]));
    expect(f[0]).toMatchObject({ kind: 'far', stopTitle: 'Drinks at Pennant' });
  });
  it('flags dinner before lunch', () => {
    const f = tripCheck(trip([a('d', 'Dinner at Silver Fox', 1, null, null), a('l', 'Lunch at Oscars', 2, null, null)]));
    expect(f[0]).toMatchObject({ kind: 'meals' });
  });
  it('returns at most two findings', () => {
    const f = tripCheck(trip([a('d', 'Dinner at X', 1, 33.3, -117.0), a('l', 'Lunch at Y', 2, 33.31, -117.0), a('t', 'Torrey', 3, 32.921, -117.251), a('m', 'Museum', 4, 32.732, -117.150), a('c', 'Cove', 5, 32.85, -117.27)]));
    expect(f.length).toBeLessThanOrEqual(2);
  });
});

describe('findingText / greeting', () => {
  it('zig-zag has a free local fix', () => {
    const t = findingText({ kind: 'zigzag', dayId: 'D2', dayNumber: 2, savedKm: 18 });
    expect(t.local).toEqual([{ kind: 'trip.optimizeDay', dayId: 'D2' }]);
    expect(t.action).toBe('Reorder day 2');
  });
  it('far stop asks Nova', () => {
    const t = findingText({ kind: 'far', dayId: 'D2', dayNumber: 2, stopTitle: 'Pennant', km: 40, city: 'Mission Beach' });
    expect(t.local).toBeNull();
    expect(t.prompt).toMatch(/near the rest of day 2/);
  });
  it('greets by name, no exclamation marks', () => {
    expect(greeting('Mark', [])).toBe("Hi Mark. Your trip looks good. Ask me for anything you'd like to change.");
    expect(greeting(null, [])).not.toMatch(/!/);
  });
});

import { checkBookings } from '@/utils/tripCheck';

describe('checkBookings (wallet bookings → clash input)', () => {
  it('a flight uses its printed local day and local times', () => {
    const out = checkBookings([{ kind: 'boarding_pass', item: { id: 'P', airline: 'Alaska', flightNumber: 'AS 512', localDate: '2026-11-03', departureTime: '2026-11-03T14:05:00', arrivalTime: '2026-11-03T16:20:00' } } as never]);
    expect(out[0]).toEqual({ name: 'Alaska AS 512', date: '2026-11-03', start: '14:05', end: '16:20', kind: 'flight' });
  });
  it('a train uses its printed times; other reservations are not clash candidates', () => {
    const out = checkBookings([
      { kind: 'reservation', item: { id: 'R', type: 'activity', transitMode: 'train', title: 'Pacific Surfliner', checkIn: '2026-11-02', departureLocalTime: '09:19', arrivalLocalTime: '11:05' } } as never,
      { kind: 'reservation', item: { id: 'D', type: 'restaurant', title: 'Pennant', checkIn: '2026-11-01', time: '19:00' } } as never,
    ]);
    expect(out).toEqual([{ name: 'Pacific Surfliner', date: '2026-11-02', start: '09:19', end: '11:05', kind: 'transit' }]);
  });
});

describe('tripCheck clash', () => {
  it('flags a timed stop during a flight', () => {
    const t = { id: 'T', destination: { name: 'MB', lat: null, lng: null }, additionalDestinations: [],
      days: [{ id: 'D3', dayNumber: 3, destinationIndex: 0, activities: [{ id: 'k', title: 'Kayaking', order: 1, lat: null, lng: null, type: 'activity', startTime: '15:00' }] }] } as never;
    const f = tripCheck(t, [{ name: 'Alaska AS 512', date: '2026-11-03', start: '14:05', end: '16:20', kind: 'flight' }], '2026-11-01');
    expect(f[0]).toMatchObject({ kind: 'clash', stopTitle: 'Kayaking', booking: 'Alaska AS 512' });
  });
});
