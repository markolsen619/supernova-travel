import { buildBookingAction } from '@/utils/bookingLinks';

const hotel = {
  type: 'hotel' as const,
  placeId: 'ChIJhotel',
  name: 'Hotel Lisboa',
  checkIn: '2026-10-15',
  checkOut: '2026-10-21',
  affiliateId: 'AID123',
};

describe('buildBookingAction — hotels', () => {
  it('sends hotels to Booking.com with the trip dates', () => {
    const action = buildBookingAction(hotel)!;
    expect(action.url).toContain('booking.com');
    expect(action.url).toContain('checkin=2026-10-15');
    expect(action.url).toContain('checkout=2026-10-21');
  });

  it('includes the affiliate id when one is configured', () => {
    expect(buildBookingAction(hotel)!.url).toContain('aid=AID123');
  });

  it('still produces a working link with no affiliate id', () => {
    // The feature must not be dead before the partner account exists.
    const action = buildBookingAction({ ...hotel, affiliateId: null })!;
    expect(action.url).toContain('booking.com');
    expect(action.url).not.toContain('aid=');
  });

  it('omits dates when the trip has none', () => {
    const action = buildBookingAction({ ...hotel, checkIn: null, checkOut: null })!;
    expect(action.url).not.toContain('checkin=');
  });

  it('names the destination in the label so it is clear this leaves the app', () => {
    expect(buildBookingAction(hotel)!.label).toMatch(/Booking\.com/);
  });

  it('url-encodes a name with spaces and accents', () => {
    const action = buildBookingAction({ ...hotel, name: 'Hôtel de Ville & Spa' })!;
    expect(action.url).not.toContain(' ');
    expect(action.url).toContain('H%C3%B4tel');
  });
});

describe('buildBookingAction — restaurants and activities', () => {
  it('sends a restaurant to its Google Maps entry', () => {
    // Maps carries the place's own reserve / call / website actions, which we
    // would otherwise have to pay a pricier Places SKU to fetch ourselves.
    const action = buildBookingAction({
      type: 'restaurant', placeId: 'ChIJfood', name: 'Cervejaria Ramiro',
      checkIn: null, checkOut: null, affiliateId: null,
    })!;
    expect(action.url).toContain('google.com/maps');
    expect(action.url).toContain('ChIJfood');
  });

  it('sends an activity to Maps too', () => {
    expect(
      buildBookingAction({
        type: 'activity', placeId: 'ChIJmuseum', name: 'Museu',
        checkIn: null, checkOut: null, affiliateId: null,
      })!.url,
    ).toContain('google.com/maps');
  });

  it('falls back to a name search when the stop has no Google place id', () => {
    // Mapbox-grounded stops have coordinates but no placeId.
    const action = buildBookingAction({
      type: 'restaurant', placeId: '', name: 'Tasca do Chico',
      checkIn: null, checkOut: null, affiliateId: null,
    })!;
    expect(action.url).toContain('Tasca');
    expect(action.url).not.toContain('query_place_id');
  });
});

describe('buildBookingAction — nothing to book', () => {
  it('returns null for free time', () => {
    expect(
      buildBookingAction({ type: 'free', placeId: 'x', name: 'Beach', checkIn: null, checkOut: null, affiliateId: null }),
    ).toBeNull();
  });

  it('returns null for a flight', () => {
    // A boarding pass is already booked by the time it is in an itinerary.
    expect(
      buildBookingAction({ type: 'flight', placeId: 'x', name: 'TP204', checkIn: null, checkOut: null, affiliateId: null }),
    ).toBeNull();
  });

  it('returns null when there is neither a place id nor a name', () => {
    expect(
      buildBookingAction({ type: 'restaurant', placeId: '', name: '   ', checkIn: null, checkOut: null, affiliateId: null }),
    ).toBeNull();
  });
});
