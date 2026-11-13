import { trainLink, trainPartner, trainUrl, TRAIN_MAX_KM } from '@/utils/trainLinks';
import { applyTemplate, linkTemplatesFromEnv } from '@/utils/partnerLinks';

// Owner 2026-11-12: Omio isn't on Travelpayouts for this account, impact.com declined us and Trainline isn't listed, so
// trains go to Trip.com in Europe and 12Go in Asia (Travelpayouts), chosen by country like tours (GetYourGuide/Viator).
const none = { airalo: null, tripcom: null, twelveGo: null };
const prague = { name: 'Prague', countryCode: 'CZ', lat: 50.0755, lng: 14.4378 };
const budapest = { name: 'Budapest', countryCode: 'HU', lat: 47.4979, lng: 19.0402 };
const bangkok = { name: 'Bangkok', countryCode: 'TH', lat: 13.7563, lng: 100.5018 };
const chiangMai = { name: 'Chiang Mai', countryCode: 'TH', lat: 18.7883, lng: 98.9853 };
const nyc = { name: 'New York', countryCode: 'US', lat: 40.7128, lng: -74.006 };
const boston = { name: 'Boston', countryCode: 'US', lat: 42.3601, lng: -71.0589 };
const tokyo = { name: 'Tokyo', countryCode: 'JP', lat: 35.6762, lng: 139.6503 };

describe('trainPartner', () => {
  it('Europe → Trip.com, Asia → 12Go, elsewhere → none', () => {
    expect(trainPartner('CZ')).toBe('tripcom');
    expect(trainPartner('GB')).toBe('tripcom');
    expect(trainPartner('ch')).toBe('tripcom');
    expect(trainPartner('TH')).toBe('twelveGo');
    expect(trainPartner('JP')).toBe('twelveGo');
    expect(trainPartner('US')).toBeNull();
    expect(trainPartner(null)).toBeNull();
  });
});

describe('trainUrl', () => {
  it("the partner's search page, tagged by its template", () => {
    expect(trainUrl('tripcom', none)).toBe('https://www.trip.com/trains/europe/');
    expect(trainUrl('twelveGo', none)).toBe('https://12go.asia/en');
    expect(trainUrl('tripcom', { ...none, tripcom: 'https://tp.media/r?p=1&u={url}' })).toBe('https://tp.media/r?p=1&u=https%3A%2F%2Fwww.trip.com%2Ftrains%2Feurope%2F');
  });
});

describe('trainLink', () => {
  it('a short European leg with nothing booked: Trip.com', () => {
    expect(trainLink(prague, budapest, 0, none)).toEqual({ label: 'Find trains & buses Prague → Budapest · Trip.com', url: 'https://www.trip.com/trains/europe/' });
  });
  it('a short Asian leg: 12Go', () => {
    expect(trainLink(bangkok, chiangMai, 0, none)?.label).toBe('Find trains & buses Bangkok → Chiang Mai · 12Go');
  });
  it('the arriving city decides the partner', () => {
    expect(trainLink({ ...budapest, countryCode: 'HU' }, { ...prague }, 0, none)?.url).toBe('https://www.trip.com/trains/europe/');
  });
  it('nothing where neither partner sells tickets (the Americas)', () => {
    expect(trainLink(nyc, boston, 0, none)).toBeNull();
  });
  it('names cities without their country', () => {
    expect(trainLink({ ...prague, name: 'Prague, Czechia' }, { ...budapest, name: 'Budapest, Hungary' }, 0, none)?.label).toBe('Find trains & buses Prague → Budapest · Trip.com');
  });
  it('nothing when the leg is booked or too far', () => {
    expect(trainLink(prague, budapest, 1, none)).toBeNull();
    expect(trainLink(prague, tokyo, 0, none)).toBeNull();
    expect(TRAIN_MAX_KM).toBe(800);
  });
  it('nothing when a city has no coordinates', () => {
    expect(trainLink({ ...prague, lat: null, lng: null }, budapest, 0, none)).toBeNull();
  });
});

describe('partner templates', () => {
  it('reads the Trip.com and 12Go templates from build settings', () => {
    expect(linkTemplatesFromEnv({ EXPO_PUBLIC_TRIPCOM_LINK_TEMPLATE: 'a{url}', EXPO_PUBLIC_12GO_LINK_TEMPLATE: ' b{raw} ' })).toEqual({ airalo: null, tripcom: 'a{url}', twelveGo: 'b{raw}' });
    expect(applyTemplate('x', null)).toBe('x');
  });
});
