import { tripDaysInYear, yearSummary, earthFraction, type YTTrip } from '../../functions/src/yearInTravel';

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const stop = (lat: number | null, lng: number | null, type = 'activity', order = 0, photoUrls: string[] = []) => ({ lat, lng, type, order, photoUrls });
const trip = (o: Partial<YTTrip> & { id: string }): YTTrip => ({
  title: o.id, authorUid: 'me', members: ['me'], start: d('2026-05-01'), end: d('2026-05-03'),
  cities: [{ name: 'Lisbon', countryCode: 'PT', lat: 38.72, lng: -9.14 }], travelStyles: [], days: [], ...o,
});
const base = { uid: 'me', year: 2026, nowMs: Date.UTC(2026, 10, 1), reviewPhotos: [], profiles: {}, blocked: new Set<string>(), upcoming: [] };

describe('tripDaysInYear', () => {
  it('counts inclusive calendar days, clipped to the year', () => {
    expect(tripDaysInYear(d('2026-05-01'), d('2026-05-03'), 2026)).toBe(3);
    expect(tripDaysInYear(d('2026-12-28'), d('2027-01-03'), 2026)).toBe(4);
    expect(tripDaysInYear(d('2026-12-28'), d('2027-01-03'), 2027)).toBe(3);
    expect(tripDaysInYear(d('2025-03-01'), d('2025-03-04'), 2026)).toBe(0);
    expect(tripDaysInYear(d('2028-02-28'), d('2028-03-01'), 2028)).toBe(3); // leap day
  });
});

describe('yearSummary', () => {
  it('counts trips, cities, countries once; overlapping days once', () => {
    const s = yearSummary({ ...base, trips: [
      trip({ id: 'a', start: d('2026-05-01'), end: d('2026-05-05'), cities: [{ name: 'Lisbon', countryCode: 'PT', lat: 38.7, lng: -9.1 }, { name: 'Porto', countryCode: 'PT', lat: 41.1, lng: -8.6 }] }),
      trip({ id: 'b', authorUid: 'friend', members: ['friend', 'me'], start: d('2026-05-04'), end: d('2026-05-06'), cities: [{ name: 'lisbon', countryCode: 'PT', lat: 38.7, lng: -9.1 }] }),
      trip({ id: 'old', start: d('2025-01-01'), end: d('2025-01-02') }),
    ] });
    expect(s.trips).toBe(2);
    expect(s.daysAway).toBe(6); // May 1–6
    expect(s.cities).toBe(2);
    expect(s.countries).toBe(1);
    expect(s.longestTrip).toEqual({ tripId: 'a', title: 'a', days: 5 });
  });
  it('km between consecutive located stops by day then order; unlocated stops skipped', () => {
    const s = yearSummary({ ...base, trips: [trip({ id: 'a', days: [
      { dayNumber: 2, stops: [stop(38.80, -9.10, 'activity', 0)] },
      { dayNumber: 1, stops: [stop(38.71, -9.14, 'restaurant', 1), stop(null, null, 'free', 0), stop(38.70, -9.14, 'activity', 0)] },
    ] })] });
    expect(s.km).toBeGreaterThan(10);
    expect(s.km).toBeLessThan(13);
    expect(s.typeCounts.restaurant).toBe(1);
    expect(s.typeCounts.free).toBe(1);
    expect(s.biggestDay).toEqual({ tripId: 'a', title: 'a', dayNumber: 1, stops: 3 });
  });
  it('photos only from trips I authored plus my review photos, at most 6', () => {
    const s = yearSummary({ ...base, reviewPhotos: ['r1'], trips: [
      trip({ id: 'mine', days: [{ dayNumber: 1, stops: [stop(1, 1, 'activity', 0, ['m1', 'm2'])] }] }),
      trip({ id: 'theirs', authorUid: 'friend', members: ['friend', 'me'], days: [{ dayNumber: 1, stops: [stop(1, 1, 'activity', 0, ['t1'])] }] }),
    ] });
    expect(s.photos).toEqual(expect.arrayContaining(['m1', 'm2', 'r1']));
    expect(s.photos).not.toContain('t1');
  });
  it('companions are the other members, blocked people left out', () => {
    const s = yearSummary({ ...base, blocked: new Set(['x']),
      profiles: { friend: { name: 'Sam', avatarUrl: null }, x: { name: 'X', avatarUrl: null } },
      trips: [trip({ id: 'a', members: ['me', 'friend', 'x'] })] });
    expect(s.companions).toEqual([{ uid: 'friend', name: 'Sam', avatarUrl: null }]);
  });
  it('top style from travel styles, else from stop types; next trip passed through', () => {
    const s = yearSummary({ ...base, upcoming: [{ tripId: 'n', title: 'Tokyo', startMs: 5 }],
      trips: [trip({ id: 'a', travelStyles: ['foodie', 'cultural'] }), trip({ id: 'b', travelStyles: ['foodie'] })] });
    expect(s.topStyle).toBe('foodie');
    expect(s.nextTrip).toEqual({ tripId: 'n', title: 'Tokyo', startMs: 5 });
    const t = yearSummary({ ...base, trips: [trip({ id: 'a', days: [{ dayNumber: 1, stops: [stop(1, 1, 'restaurant'), stop(1, 1, 'restaurant'), stop(1, 1, 'activity')] }] })] });
    expect(t.topStyle).toBe('foodie');
  });
  it('places follow each trip\'s cities in order, located only', () => {
    const s = yearSummary({ ...base, trips: [trip({ id: 'a', cities: [{ name: 'A', countryCode: 'PT', lat: 1, lng: 2 }, { name: 'B', countryCode: 'PT', lat: null, lng: null }] })] });
    expect(s.places).toEqual([{ name: 'A', lat: 1, lng: 2 }]);
  });
  it('no trips: zeros', () => {
    const s = yearSummary({ ...base, trips: [] });
    expect([s.trips, s.daysAway, s.km, s.cities]).toEqual([0, 0, 0, 0]);
    expect(s.longestTrip).toBeNull();
  });
});

describe('earthFraction', () => {
  it('km over the equator', () => expect(earthFraction(40075)).toBeCloseTo(1));
});
