import { activityPartner, activityPartnerUrl, thingsToDoUrl, isSightType, type PartnerIds } from '@/utils/activityBooking';
import { buildBookingAction } from '@/utils/bookingLinks';

const ids: PartnerIds = { gygPartnerId: 'GYG123', viatorPid: 'P0001', viatorMcid: '42383' };
const none: PartnerIds = { gygPartnerId: null, viatorPid: null, viatorMcid: null };

describe('activityPartner', () => {
  it('Viator in the US, Canada and Mexico; GetYourGuide elsewhere and when unknown', () => {
    expect(activityPartner('US')).toBe('viator');
    expect(activityPartner('ca')).toBe('viator');
    expect(activityPartner('MX')).toBe('viator');
    expect(activityPartner('ES')).toBe('getyourguide');
    expect(activityPartner(null)).toBe('getyourguide');
  });
});

describe('activityPartnerUrl', () => {
  it('GetYourGuide search with the partner id and an app campaign tag', () => {
    const u = new URL(activityPartnerUrl({ name: 'Sagrada Família', near: 'Barcelona', countryCode: 'ES' }, ids));
    expect(u.origin + u.pathname).toBe('https://www.getyourguide.com/s/');
    expect(u.searchParams.get('q')).toBe('Sagrada Família, Barcelona');
    expect(u.searchParams.get('partner_id')).toBe('GYG123');
    expect(u.searchParams.get('cmp')).toBe('supernova-app');
  });
  it('Viator search with pid and mcid', () => {
    const u = new URL(activityPartnerUrl({ name: 'Alcatraz Island', near: 'San Francisco', countryCode: 'US' }, ids));
    expect(u.origin + u.pathname).toBe('https://www.viator.com/searchResults/all');
    expect(u.searchParams.get('text')).toBe('Alcatraz Island, San Francisco');
    expect(u.searchParams.get('pid')).toBe('P0001');
    expect(u.searchParams.get('mcid')).toBe('42383');
    expect(u.searchParams.get('medium')).toBe('link');
  });
  it('without ids the link still works, it just earns nothing', () => {
    const u = new URL(activityPartnerUrl({ name: 'Louvre', near: 'Paris', countryCode: 'FR' }, none));
    expect(u.searchParams.has('partner_id')).toBe(false);
    expect(u.searchParams.get('q')).toBe('Louvre, Paris');
  });
});

describe('thingsToDoUrl', () => {
  it('a city\'s things to do on the right partner', () => {
    expect(new URL(thingsToDoUrl('Lisbon', 'PT', ids)).searchParams.get('q')).toBe('Lisbon');
    expect(new URL(thingsToDoUrl('New York', 'US', ids)).host).toBe('www.viator.com');
  });
});

describe('isSightType', () => {
  it('sights and attractions yes; restaurants, hotels and cities no', () => {
    expect(isSightType('tourist_attraction')).toBe(true);
    expect(isSightType('museum')).toBe(true);
    expect(isSightType('restaurant')).toBe(false);
    expect(isSightType('lodging')).toBe(false);
    expect(isSightType('locality')).toBe(false);
    expect(isSightType(null)).toBe(false);
  });
});

describe('buildBookingAction for activities (bookable tours instead of the Maps page)', () => {
  const base = { placeId: 'P', name: 'Sagrada Família', near: 'Barcelona', checkIn: null, checkOut: null, affiliateId: null };
  it('an activity stop goes to the partner, named on the button', () => {
    const a = buildBookingAction({ ...base, type: 'activity', countryCode: 'ES', partnerIds: ids })!;
    expect(a.label).toBe('Find tickets & tours · GetYourGuide');
    expect(a.url).toContain('getyourguide.com');
  });
  it('restaurants keep Google Maps; hotels keep Booking.com', () => {
    expect(buildBookingAction({ ...base, type: 'restaurant', countryCode: 'ES', partnerIds: ids })!.label).toBe('Reserve or call');
    expect(buildBookingAction({ ...base, type: 'hotel', countryCode: 'ES', partnerIds: ids })!.label).toBe('Book on Booking.com');
  });
});
