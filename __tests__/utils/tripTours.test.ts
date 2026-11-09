import { tourCities, normalizeTime, bookedStop, bookedReservation, defaultDayIndex, showTicketsLink, dayDateFor } from '@/utils/tripTours';

const trip = (o: Record<string, unknown> = {}) => ({
  startDay: '2026-12-01', startDate: null, endDate: { toDate: () => new Date('2026-12-06T12:00:00') },
  destination: { name: 'Tokyo', countryCode: 'JP' }, additionalDestinations: [{ name: 'Kyoto', countryCode: 'JP' }], ...o,
});

describe('tourCities (owner, 2026-11-08: tours & tickets on your trips)', () => {
  it('every city of an upcoming or current trip, for members', () => {
    expect(tourCities(trip() as never, '2026-11-08', true).map((c) => [c.index, c.name, c.countryCode])).toEqual([[0, 'Tokyo', 'JP'], [1, 'Kyoto', 'JP']]);
    expect(tourCities(trip() as never, '2026-12-03', true)).toHaveLength(2);
  });
  it('nothing for a past trip or for someone who isn\'t on it', () => {
    expect(tourCities(trip() as never, '2026-12-07', true)).toEqual([]);
    expect(tourCities(trip() as never, '2026-11-08', false)).toEqual([]);
  });
  it('a trip without dates still counts as upcoming', () => {
    expect(tourCities(trip({ startDay: null, endDate: null }) as never, '2026-11-08', true)).toHaveLength(2);
  });
});

describe('the "Booked something?" sheet', () => {
  it('normalizeTime reads 24-hour and am/pm times, else null', () => {
    expect(normalizeTime('9:30')).toBe('09:30');
    expect(normalizeTime('14:05')).toBe('14:05');
    expect(normalizeTime('7:30 pm')).toBe('19:30');
    expect(normalizeTime('12 am')).toBe('00:00');
    expect(normalizeTime('12:15pm')).toBe('12:15');
    expect(normalizeTime('25:00')).toBeNull();
    expect(normalizeTime('')).toBeNull();
    expect(normalizeTime('soon')).toBeNull();
  });
  it('bookedStop: an activity stop placed later by name in its city, with the time, no undefined values', () => {
    const s = bookedStop({ name: 'Tsukiji food tour', city: 'Tokyo', time: '09:30', partner: 'GetYourGuide' });
    expect(s).toMatchObject({ type: 'activity', title: 'Tsukiji food tour', titleSource: 'user', searchQuery: 'Tsukiji food tour, Tokyo', startTime: '09:30', notes: 'Booked on GetYourGuide', lat: null, visited: false });
    expect(Object.values(s).some((v) => v === undefined)).toBe(false);
    expect(bookedStop({ name: 'X', city: 'Tokyo', time: null, partner: 'Viator' }).startTime).toBeNull();
  });
  it('bookedReservation: a wallet activity on that day, with city for trip matching; no undefined keys', () => {
    const r = bookedReservation({ name: 'Tsukiji food tour', date: '2026-12-02', time: '09:30', city: 'Tokyo', countryCode: 'JP', partner: 'GetYourGuide', ownerUid: 'u', nowIso: '2026-11-08T10:00:00.000Z' });
    expect(r).toEqual({ ownerUid: 'u', type: 'activity', title: 'Tsukiji food tour', confirmationCode: '', checkIn: '2026-12-02', time: '09:30', placeCity: 'Tokyo', placeCountryCode: 'JP', notes: 'Booked on GetYourGuide', createdAt: '2026-11-08T10:00:00.000Z' });
    const bare = bookedReservation({ name: 'X', date: null, time: null, city: 'Tokyo', countryCode: null, partner: 'Viator', ownerUid: 'u', nowIso: 'n' });
    expect(bare).not.toHaveProperty('checkIn'); expect(bare).not.toHaveProperty('time'); expect(bare).not.toHaveProperty('placeCountryCode');
  });
  it('dayDateFor and defaultDayIndex: today\'s day when the trip is under way in that city, else the city\'s first day', () => {
    const days = [{ dayNumber: 1, destinationIndex: 0 }, { dayNumber: 2, destinationIndex: 0 }, { dayNumber: 3, destinationIndex: 1 }, { dayNumber: 4, destinationIndex: 1 }];
    expect(dayDateFor('2026-12-01', 3)).toBe('2026-12-03');
    expect(dayDateFor(null, 3)).toBeNull();
    expect(defaultDayIndex(days, 1, '2026-12-01', '2026-11-08')).toBe(2);
    expect(defaultDayIndex(days, 1, '2026-12-01', '2026-12-04')).toBe(3);
    expect(defaultDayIndex(days, 0, '2026-12-01', '2026-12-04')).toBe(0);
    expect(defaultDayIndex(days, 0, null, '2026-12-04')).toBe(0);
  });
  it('showTicketsLink: activity stops with no booking and not yet visited', () => {
    expect(showTicketsLink({ type: 'activity' } as never)).toBe(true);
    expect(showTicketsLink({ type: 'restaurant' } as never)).toBe(false);
    expect(showTicketsLink({ type: 'activity', bookingRef: 'ABC' } as never)).toBe(false);
    expect(showTicketsLink({ type: 'activity', fromBooking: { id: 'r' } } as never)).toBe(false);
    expect(showTicketsLink({ type: 'activity', visited: true } as never)).toBe(false);
  });
});
