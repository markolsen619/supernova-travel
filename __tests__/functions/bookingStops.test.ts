import { bookingStopId, bookingDayNumber, stopFromBooking, existingStopFor, tripCalendarDay, bookingStopAllowed, tripStartDay } from '../../functions/src/bookingStops';

const dinner = { ownerUid: 'mark', type: 'restaurant', title: 'Lokál Dlouhá', confirmationCode: 'L1', checkIn: '2026-11-19', time: '19:30', address: 'Dlouhá 33, Prague', tripId: 'ce' };
const train = { ownerUid: 'mark', type: 'activity', transitMode: 'train', title: 'ICE 918 Munich → Cologne', confirmationCode: 'Q1', checkIn: '2026-12-01', departureLocalTime: '10:19', tripId: 'ce' };
const hotel = { ownerUid: 'mark', type: 'hotel', title: 'Boutique Hotel Falkenturm', confirmationCode: '88412', checkIn: '2026-11-28', checkOut: '2026-12-01', address: 'Falkenturmstr. 10, Munich', tripId: 'ce' };
const flight = { ownerUid: 'mark', airline: 'Lufthansa', flightNumber: 'LH 431', origin: 'ORD', destination: 'MUC', departureTime: '2026-11-18T02:40:00Z', localDate: '2026-11-17', tripId: 'ce' };

describe('bookingStopId', () => {
  it('is fixed per booking, so a repeat write never makes a second stop', () => {
    expect(bookingStopId('reservation', 'r1')).toBe('booking_reservation_r1');
  });
});

describe('bookingDayNumber', () => {
  it('finds the trip day a booking is on', () => {
    expect(bookingDayNumber('reservation', dinner, '2026-11-18')).toBe(2);
    expect(bookingDayNumber('boarding_pass', flight, '2026-11-17')).toBe(1); // the printed local day
  });
  it('is null outside the trip or without dates', () => {
    expect(bookingDayNumber('reservation', dinner, '2026-11-20')).toBeNull();
    expect(bookingDayNumber('reservation', { ...dinner, checkIn: undefined }, '2026-11-18')).toBeNull();
    expect(bookingDayNumber('reservation', dinner, null)).toBeNull();
  });
});

describe('stopFromBooking', () => {
  it('a restaurant becomes a stop found on the map by name and city, never renamed, with no code or address (stops are readable by anyone who can see the trip)', () => {
    const s = stopFromBooking('reservation', 'r1', dinner, 'Prague');
    expect(s).toMatchObject({ type: 'restaurant', title: 'Lokál Dlouhá', searchQuery: 'Lokál Dlouhá, Prague', bookingRef: null, address: null,
      titleSource: 'user', startTime: null, fromBooking: { kind: 'reservation', id: 'r1', ownerUid: 'mark', auto: true } });
  });
  it('a train is a transport stop, not looked up as a place', () => {
    expect(stopFromBooking('reservation', 't1', train, 'Munich')).toMatchObject({ type: 'transport', title: 'ICE 918 Munich → Cologne', searchQuery: null });
  });
  it('a hotel is a check-in stop', () => {
    expect(stopFromBooking('reservation', 'h1', hotel, 'Munich')).toMatchObject({ type: 'hotel', title: 'Check in · Boutique Hotel Falkenturm' });
  });
  it('a flight is a flight stop', () => {
    expect(stopFromBooking('boarding_pass', 'f1', flight, 'Prague')).toMatchObject({ type: 'flight', title: 'LH 431 ORD → MUC', searchQuery: null });
  });
  it('writes no undefined (Firestore rejects it)', () => {
    const s = stopFromBooking('reservation', 'r1', { ownerUid: 'm', type: 'activity', title: 'Tour' }, null);
    expect(Object.values(s).includes(undefined)).toBe(false);
  });
});

describe('existingStopFor', () => {
  const stops = [
    { id: 'a', type: 'restaurant', title: 'Dinner at Lokál Dlouhá', placeName: null },
    { id: 'b', type: 'activity', title: 'Prague Castle', placeName: null },
  ];
  it('uses a stop you already planned for that place instead of adding another', () => {
    expect(existingStopFor('reservation', dinner, stops)).toBe('a');
  });
  it('needs the same kind of stop and every distinctive word', () => {
    expect(existingStopFor('reservation', { ...dinner, title: 'Lokál Hamburk' }, stops)).toBeNull();
    expect(existingStopFor('boarding_pass', flight, stops)).toBeNull();
  });
});

describe('tripCalendarDay', () => {
  it('reads a trip date saved at local midnight as that day, east or west of UTC', () => {
    expect(tripCalendarDay(Date.UTC(2026, 10, 17, 23, 0))).toBe('2026-11-18'); // Nov 18 00:00 in Prague (UTC+1)
    expect(tripCalendarDay(Date.UTC(2026, 10, 18, 8, 0))).toBe('2026-11-18');  // Nov 18 00:00 in San Diego (UTC−8)
    expect(tripCalendarDay(Date.UTC(2026, 10, 18, 0, 0))).toBe('2026-11-18');
  });
});

describe('bookingStopAllowed', () => {
  it('places are stops on every trip; travel only on private trips', () => {
    expect(bookingStopAllowed('reservation', dinner, 'public')).toBe(true);
    expect(bookingStopAllowed('reservation', { ...dinner, type: 'show' }, 'followers')).toBe(true);
    expect(bookingStopAllowed('reservation', hotel, 'public')).toBe(false);
    expect(bookingStopAllowed('reservation', train, 'followers')).toBe(false);
    expect(bookingStopAllowed('boarding_pass', flight, 'public')).toBe(false);
    for (const b of [hotel, train, dinner]) expect(bookingStopAllowed('reservation', b, 'private')).toBe(true);
    expect(bookingStopAllowed('boarding_pass', flight, 'private')).toBe(true);
  });
});

describe('tripStartDay', () => {
  it('prefers the calendar day the app saved, so every time zone lands on the right day', () => {
    expect(tripStartDay({ startDay: '2026-11-18', startDate: { toMillis: () => Date.UTC(2026, 10, 17, 11) } })).toBe('2026-11-18'); // NZ summer
  });
  it('falls back to the timestamp for trips saved before', () => {
    expect(tripStartDay({ startDate: { toMillis: () => Date.UTC(2026, 10, 17, 23) } })).toBe('2026-11-18');
    expect(tripStartDay({})).toBeNull();
  });
});

describe('tripStartDay after an older app moved the dates', () => {
  it('ignores a saved day the timestamp has left behind (1.0.3 edits the date, not the day)', () => {
    expect(tripStartDay({ startDay: '2026-11-18', startDate: { toMillis: () => Date.UTC(2026, 11, 2, 8) } })).toBe('2026-12-02');
  });
});
