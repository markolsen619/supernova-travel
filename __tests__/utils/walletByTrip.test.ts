import { walletByTrip, bookingDay, isSectionOpen, bookingCountLabel, defaultSegment } from '@/utils/walletByTrip';
import type { BoardingPass, Reservation } from '@/types';
import type { TripSummary } from '@/utils/walletLink';

const trip = (tripId: string, start: string | null, end: string | null): TripSummary => ({ tripId, title: tripId, start, end });
const res = (id: string, checkIn: string | undefined, tripId?: string) =>
  ({ id, type: 'hotel', title: id, confirmationCode: '', checkIn, tripId, ownerUid: 'me', createdAt: '' }) as Reservation;
const pass = (id: string, localDate: string, tripId?: string) =>
  ({ id, flightNumber: id, departureTime: `${localDate}T10:00:00`, localDate, tripId, ownerUid: 'me' }) as unknown as BoardingPass;

const today = '2026-10-08';
const trips = [trip('europe', '2026-11-18', '2026-12-05'), trip('chicago', '2026-10-09', '2026-10-13'),
  trip('japan', '2026-10-21', '2026-10-30'), trip('lisbon', '2026-09-01', '2026-09-07'), trip('someday', null, null)];

describe('walletByTrip', () => {
  const w = walletByTrip(trips,
    [pass('ICE918', '2026-12-01', 'europe'), pass('UA1', '2026-10-09', 'chicago')],
    [res('Falkenturm', '2026-11-28', 'europe'), res('Loose hotel', '2026-11-01'), res('Old', '2026-09-02', 'lisbon'), res('Gone', '2026-11-02', 'deleted-trip')],
    today);

  it('upcoming trips soonest first, each with its bookings by date; undated trips last', () => {
    expect(w.upcoming.map((s) => s.trip.tripId)).toEqual(['chicago', 'japan', 'europe', 'someday']);
    expect(w.upcoming[2].items.map((i) => i.item.id)).toEqual(['Falkenturm', 'ICE918']);
  });
  it('an upcoming trip with nothing booked still shows, empty', () => {
    expect(w.upcoming.find((s) => s.trip.tripId === 'japan')!.items).toEqual([]);
  });
  it('past trips are separate, most recent first', () => {
    expect(w.past.map((s) => s.trip.tripId)).toEqual(['lisbon']);
  });
  it('unlinked bookings, and ones linked to a trip you no longer have, are "not on a trip"', () => {
    expect(w.unlinked.map((i) => i.item.id)).toEqual(['Loose hotel', 'Gone']);
  });
  it('a trip still under way counts as upcoming', () => {
    expect(walletByTrip([trip('now', '2026-10-01', '2026-10-10')], [], [], today).upcoming).toHaveLength(1);
  });
});

describe('bookingDay', () => {
  it('a flight by its printed day, a reservation by check-in', () => {
    expect(bookingDay({ kind: 'boarding_pass', item: pass('X', '2026-12-01') })).toBe('2026-12-01');
    expect(bookingDay({ kind: 'reservation', item: res('Y', '2026-11-28') })).toBe('2026-11-28');
    expect(bookingDay({ kind: 'reservation', item: res('Z', undefined) })).toBeNull();
  });
});

describe("walletByTrip with members' shared bookings", () => {
  it('files them under their trip by date, never under Not on a trip', () => {
    const kells = { kind: 'reservation' as const, item: res('Sacher', '2026-11-20', 'europe'),
      sharedBy: { uid: 'kell', name: 'Kell Bell', tripId: 'europe' } };
    const w = walletByTrip(trips, [], [res('Falkenturm', '2026-11-28', 'europe')], today, [kells]);
    const europe = w.upcoming.find((s) => s.trip.tripId === 'europe')!;
    expect(europe.items.map((b) => b.item.id)).toEqual(['Sacher', 'Falkenturm']);
    expect(w.unlinked).toEqual([]);
  });
});

describe('By trip sections', () => {
  it('opens the soonest trip and folds the rest until you choose', () => {
    expect(isSectionOpen('europe', 0, {})).toBe(true);
    expect(isSectionOpen('japan', 1, {})).toBe(false);
    expect(isSectionOpen('europe', 0, { europe: false })).toBe(false);
    expect(isSectionOpen('japan', 1, { japan: true })).toBe(true);
  });
  it('counts what a folded trip holds', () => {
    expect(bookingCountLabel(0)).toBe('Nothing booked yet');
    expect(bookingCountLabel(1)).toBe('1 booking');
    expect(bookingCountLabel(3)).toBe('3 bookings');
  });
  it('lands Pro on By trip and everyone else on All', () => {
    expect(defaultSegment(true)).toBe('trips');
    expect(defaultSegment(false)).toBe('all');
  });
});
