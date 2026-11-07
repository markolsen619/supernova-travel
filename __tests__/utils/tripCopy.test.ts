import { copyTripDocs, canCopyTrip } from '@/utils/tripCopy';

const stop = (o: Record<string, unknown>) => ({
  id: 'a', type: 'activity', title: 'Senso-ji', titleSource: 'ai', placeId: 'ChIJ1', placeName: 'Sensō-ji', address: '2-3-1 Asakusa',
  lat: 35.7148, lng: 139.7967, searchQuery: 'Senso-ji, Tokyo', startTime: '09:00', endTime: '10:00', durationMinutes: 60,
  notes: 'Meet Kenji at the gate', bookingRef: 'ABC123', cost: 20, currency: 'USD', mediaUrls: ['https://x/y.jpg'],
  visited: true, visitedAt: { toMillis: () => 1 }, order: 1000, ...o,
});
const source = {
  id: 'src', authorUid: 'alice', title: 'Tokyo: Peaks & Palates', description: 'My honeymoon notes',
  visibility: 'public', isEditorial: false,
  destination: { name: 'Tokyo', placeId: 'ChIJT', lat: 35.68, lng: 139.76, countryCode: 'JP', bounds: null, nights: 3 },
  additionalDestinations: [{ name: 'Kyoto', placeId: 'ChIJK', lat: 35.01, lng: 135.77, countryCode: 'JP', bounds: null, nights: 2 }],
  days: [
    { id: 'd2', dayNumber: 2, destinationIndex: 0, title: 'Asakusa', notes: 'rest day', activities: [stop({ id: 'b', title: 'Lunch', type: 'restaurant', order: 2000 }), stop({})] },
    { id: 'd1', dayNumber: 1, destinationIndex: 0, title: 'Arrival', notes: '', activities: [
      stop({ id: 'f', type: 'flight', title: 'Flight NH8', fromBooking: { kind: 'pass', id: 'p1', ownerUid: 'alice', auto: true } }),
      stop({ id: 'h', type: 'hotel', title: 'Park Hyatt', order: 500 }),
    ] },
  ],
} as never;

describe('copyTripDocs (owner, 2026-11-05: "Make it yours")', () => {
  const d = copyTripDocs(source, { authorName: 'Alice' });
  it('copies cities with their nights, days in order, and each stop\'s place', () => {
    expect(d.trip.destination).toEqual({ name: 'Tokyo', placeId: 'ChIJT', lat: 35.68, lng: 139.76, countryCode: 'JP', bounds: null, nights: 3 });
    expect(d.trip.additionalDestinations.map((x) => x.name)).toEqual(['Kyoto']);
    expect(d.days.map((x) => [x.dayNumber, x.title])).toEqual([[1, 'Arrival'], [2, 'Asakusa']]);
    expect(d.stops.filter((s) => s.dayKey === 'd2').map((s) => s.title)).toEqual(['Senso-ji', 'Lunch']);
    expect(d.stops.find((s) => s.title === 'Senso-ji')).toMatchObject({ placeId: 'ChIJ1', placeName: 'Sensō-ji', lat: 35.7148, lng: 139.7967, searchQuery: 'Senso-ji, Tokyo', type: 'activity' });
  });
  it('copies nothing personal: no times, notes, costs, booking codes, photos, visits, description or day notes', () => {
    const s = d.stops.find((x) => x.title === 'Senso-ji')!;
    for (const k of ['startTime', 'endTime', 'notes', 'bookingRef', 'cost', 'currency', 'mediaUrls', 'visited', 'visitedAt', 'address']) expect(s).not.toHaveProperty(k);
    expect(d.days.every((x) => x.notes === '')).toBe(true);
    expect(d.trip.description).toBe('');
  });
  it('leaves out stops made from someone\'s bookings (their flights and hotels)', () => {
    expect(d.stops.map((s) => s.title)).not.toContain('Flight NH8');
    expect(d.stops.map((s) => s.title)).toContain('Park Hyatt');
  });
  it('is a private trip of yours, credited to the original', () => {
    expect(d.trip).toMatchObject({ title: 'Tokyo: Peaks & Palates', visibility: 'private', source: 'copy', copiedFrom: { tripId: 'src', authorUid: 'alice', authorName: 'Alice' } });
  });
});

describe('canCopyTrip', () => {
  it('someone else\'s trip with stops, not hidden; never your own', () => {
    expect(canCopyTrip(source, 'me')).toBe(true);
    expect(canCopyTrip(source, 'alice')).toBe(false);
    expect(canCopyTrip({ ...(source as object), moderationHidden: true } as never, 'me')).toBe(false);
    expect(canCopyTrip({ ...(source as object), days: [] } as never, 'me')).toBe(false);
    expect(canCopyTrip(source, null)).toBe(false);
  });
});
