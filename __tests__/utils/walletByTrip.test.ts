import { walletByTrip, bookingDay } from '@/utils/walletByTrip';
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
