import { fromSharedDoc, mergeTripBookings, firstName, bookingRoute, sharedDetailRows } from '@/utils/sharedBookings';
import type { TripBooking } from '@/utils/bookingDays';

const kellHotel = { kind: 'reservation', id: 'r9', ownerUid: 'kell', ownerName: 'Kell Bell', tripId: 'ce',
  type: 'hotel', title: 'Hotel Sacher', confirmationCode: 'S1', checkIn: '2026-11-20' };
const markPass = { kind: 'boarding_pass', id: 'p1', ownerUid: 'mark', ownerName: 'Mark Olsen', tripId: 'ce',
  airline: 'Lufthansa', flightNumber: 'LH 431', departureTime: '2026-11-18T21:40:00Z', status: 'upcoming' };

describe('fromSharedDoc', () => {
  it('reads a shared copy as a booking that says whose it is', () => {
    const b = fromSharedDoc(kellHotel)!;
    expect(b.kind).toBe('reservation');
    expect(b.item.id).toBe('r9');
    expect(b.sharedBy).toEqual({ uid: 'kell', name: 'Kell Bell', tripId: 'ce' });
  });
  it('ignores a copy of an unknown kind or with no id', () => {
    expect(fromSharedDoc({ ...kellHotel, kind: 'loyalty' })).toBeNull();
    expect(fromSharedDoc({ ...kellHotel, id: undefined })).toBeNull();
  });
});

describe('mergeTripBookings', () => {
  const own: TripBooking[] = [{ kind: 'boarding_pass', item: { id: 'p1', ownerUid: 'mark' } as any }];
  it("adds other members' bookings and skips your own copies", () => {
    const shared = [fromSharedDoc(kellHotel)!, fromSharedDoc(markPass)!];
    const merged = mergeTripBookings(own, shared, 'mark');
    expect(merged.map((b) => b.item.id)).toEqual(['p1', 'r9']);
    expect(merged[0].sharedBy).toBeUndefined();
  });
});

describe('firstName', () => {
  it('is the first word, or the whole name', () => {
    expect(firstName('Kell Bell')).toBe('Kell');
    expect(firstName('  kellbell424 ')).toBe('kellbell424');
    expect(firstName('')).toBe('A traveler');
  });
});

describe('bookingRoute', () => {
  it('opens the read-only view for a shared booking and the wallet detail for yours', () => {
    expect(bookingRoute(fromSharedDoc(kellHotel)!)).toBe('/(wallet)/shared-booking?tripId=ce&id=reservation_r9');
    expect(bookingRoute({ kind: 'reservation', item: { id: 'r1' } as any })).toBe('/(wallet)/reservation/r1');
    expect(bookingRoute({ kind: 'boarding_pass', item: { id: 'p1' } as any })).toBe('/(wallet)/boarding-pass/p1');
  });
});

describe('sharedDetailRows', () => {
  it('lists a hotel with its confirmation code and stay', () => {
    const rows = sharedDetailRows(fromSharedDoc({ ...kellHotel, checkOut: '2026-11-23', address: 'Philharmoniker Str. 4' })!);
    expect(rows.map((r) => r.label)).toEqual(['Confirmation code', 'Check-in', 'Check-out', 'Address']);
    expect(rows[0].value).toBe('S1');
  });
  it('lists a train by route and printed times', () => {
    const train = { kind: 'reservation', id: 't1', ownerUid: 'kell', ownerName: 'Kell', tripId: 'ce', type: 'activity',
      transitMode: 'train', title: 'ICE 918', confirmationCode: 'Q1', checkIn: '2026-11-25',
      fromPlace: 'Berlin Hbf', toPlace: 'München Hbf', departureLocalTime: '10:19', arrivalLocalTime: '14:29', seat: '45' };
    const rows = sharedDetailRows(fromSharedDoc(train)!);
    expect(rows.map((r) => r.label)).toEqual(['Confirmation code', 'From', 'To', 'Departs', 'Arrives', 'Seat']);
    expect(rows.find((r) => r.label === 'Departs')!.value).toContain('10:19');
  });
  it('lists a flight without anything to board with', () => {
    const rows = sharedDetailRows(fromSharedDoc({ ...markPass, seat: '32A', gate: 'C18', origin: 'ORD', destination: 'MUC' })!);
    expect(rows.map((r) => r.label)).toEqual(['Flight', 'Route', 'Seat', 'Gate']);
    expect(rows[1].value).toBe('ORD → MUC');
  });
});
