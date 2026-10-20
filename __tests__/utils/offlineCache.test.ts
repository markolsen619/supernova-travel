// __tests__/utils/offlineCache.test.ts
import { Timestamp } from 'firebase/firestore';
import {
  shouldPersistQuery, reviveTimestamps, offlineTripSet, needsPrefetch,
  cacheBuster, cacheBelongsTo, OFFLINE_TRIP_CAP, tripsForOffline,
} from '@/utils/offlineCache';

const allowed = new Set(['t1']);

describe('shouldPersistQuery', () => {
  it('keeps the wallet and trip lists for the signed-in user', () => {
    expect(shouldPersistQuery(['boardingPasses', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['reservations', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['trips', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['myTrips', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['sharedTripBookings', 'u1', 't1,t2'], 'success', allowed)).toBe(true);
  });
  it('keeps trip details only for trips in the offline set', () => {
    expect(shouldPersistQuery(['trip', 't1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['tripBookings', 't1', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['packingItems', 't1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['trip', 't9'], 'success', allowed)).toBe(false);
  });
  it('drops other people\'s trip lists, feeds and failed queries', () => {
    expect(shouldPersistQuery(['trips', 'u1', 'public'], 'success', allowed)).toBe(false);
    expect(shouldPersistQuery(['feed', 'forYou'], 'success', allowed)).toBe(false);
    expect(shouldPersistQuery(['boardingPasses', 'u1'], 'error', allowed)).toBe(false);
    expect(shouldPersistQuery(['boardingPasses', 'u1'], 'pending', allowed)).toBe(false);
  });
});

describe('reviveTimestamps', () => {
  it('turns serialised timestamps back into Timestamps, nested in arrays and objects', () => {
    const t = Timestamp.fromMillis(1_760_000_000_000);
    const round = JSON.parse(JSON.stringify({ startDate: t, days: [{ date: t, n: 1 }] }));
    const out = reviveTimestamps(round);
    expect(out.startDate).toBeInstanceOf(Timestamp);
    expect(out.startDate.toMillis()).toBe(1_760_000_000_000);
    expect(out.days[0].date).toBeInstanceOf(Timestamp);
    expect(out.days[0].n).toBe(1);
  });
  it('leaves look-alike objects without the type marker alone', () => {
    const v = { seconds: 5, nanoseconds: 0 };
    expect(reviveTimestamps(v)).toEqual({ seconds: 5, nanoseconds: 0 });
    expect(reviveTimestamps(v)).not.toBeInstanceOf(Timestamp);
  });
  it('passes primitives and null through', () => {
    expect(reviveTimestamps(null)).toBeNull();
    expect(reviveTimestamps('x')).toBe('x');
    expect(reviveTimestamps(3)).toBe(3);
  });
});

describe('offlineTripSet', () => {
  const d = (iso: string) => Timestamp.fromDate(new Date(iso));
  const now = new Date('2026-10-19T12:00:00Z');
  it('orders in progress, then upcoming soonest, then past most recent', () => {
    const ids = offlineTripSet([
      { id: 'past-old', startDate: d('2026-01-01'), endDate: d('2026-01-05') },
      { id: 'later', startDate: d('2026-12-01'), endDate: d('2026-12-05') },
      { id: 'live', startDate: d('2026-10-18'), endDate: d('2026-10-22') },
      { id: 'soon', startDate: d('2026-11-01'), endDate: d('2026-11-03') },
      { id: 'past-new', startDate: d('2026-09-01'), endDate: d('2026-09-05') },
    ], now);
    expect(ids).toEqual(['live', 'soon', 'later', 'past-new', 'past-old']);
  });
  it('puts trips with no dates after dated upcoming trips and before past ones', () => {
    const ids = offlineTripSet([
      { id: 'past', startDate: d('2026-09-01'), endDate: d('2026-09-05') },
      { id: 'tbd', startDate: null, endDate: null },
      { id: 'soon', startDate: d('2026-11-01'), endDate: d('2026-11-03') },
    ], now);
    expect(ids).toEqual(['soon', 'tbd', 'past']);
  });
  it('caps the set', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, startDate: null, endDate: null }));
    expect(offlineTripSet(many, now)).toHaveLength(OFFLINE_TRIP_CAP);
    expect(offlineTripSet(many, now, 3)).toHaveLength(3);
  });
});

describe('needsPrefetch', () => {
  const now = 1_000_000_000_000;
  it('fetches missing or older than 12 hours, skips fresh', () => {
    expect(needsPrefetch(undefined, now)).toBe(true);
    expect(needsPrefetch(now - 13 * 3600_000, now)).toBe(true);
    expect(needsPrefetch(now - 60_000, now)).toBe(false);
  });
});

describe('cacheBelongsTo', () => {
  it('matches only the same uid', () => {
    expect(cacheBelongsTo(cacheBuster('a'), 'a')).toBe(true);
    expect(cacheBelongsTo(cacheBuster('a'), 'b')).toBe(false);
    expect(cacheBelongsTo(undefined, 'a')).toBe(false);
  });
});

describe('tripsForOffline', () => {
  it('merges own trips and joined trip summaries by id, turning calendar dates into timestamps', () => {
    const own = [{ id: 'a', startDate: Timestamp.fromDate(new Date('2026-11-01T12:00:00Z')), endDate: null }];
    const joined = [
      { tripId: 'a', start: '2026-11-01', end: '2026-11-03' },
      { tripId: 'b', start: '2026-12-10', end: null },
      { tripId: 'c', start: null, end: null },
    ];
    const out = tripsForOffline(own, joined);
    expect(out.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
    const b = out.find((t) => t.id === 'b')!;
    expect(b.startDate).toBeInstanceOf(Timestamp);
    expect(b.startDate!.toDate().toISOString().slice(0, 10)).toBe('2026-12-10');
    expect(out.find((t) => t.id === 'c')!.startDate).toBeNull();
    // An own trip keeps its real timestamps.
    expect(out.find((t) => t.id === 'a')!.startDate!.toMillis()).toBe(own[0].startDate!.toMillis());
  });
});
