import { applyTemplate, linkTemplatesFromEnv } from '@/utils/partnerLinks';
import { airaloUrl, esimHomeLine } from '@/utils/esim';

const none = { omio: null, airalo: null };
const trip = (codes: string[], startDay: string | null) => ({
  id: 't1', destination: { countryCode: codes[0] }, additionalDestinations: codes.slice(1).map((c) => ({ countryCode: c })), startDay, startDate: null, endDate: null,
}) as never;

describe('partner link templates', () => {
  it('no template: the plain URL', () => {
    expect(applyTemplate('https://www.airalo.com/japan-esim', null)).toBe('https://www.airalo.com/japan-esim');
  });
  it('{url} wraps the encoded target; {raw} appends to it', () => {
    expect(applyTemplate('https://www.airalo.com/japan-esim', 'https://tp.media/r?p=1&u={url}')).toBe('https://tp.media/r?p=1&u=https%3A%2F%2Fwww.airalo.com%2Fjapan-esim');
    expect(applyTemplate('https://www.airalo.com/japan-esim', '{raw}?ref=abc')).toBe('https://www.airalo.com/japan-esim?ref=abc');
  });
  it('reads the templates from build settings, blank = none', () => {
    expect(linkTemplatesFromEnv({ EXPO_PUBLIC_AIRALO_LINK_TEMPLATE: ' x{url} ', EXPO_PUBLIC_OMIO_LINK_TEMPLATE: '' })).toEqual({ airalo: 'x{url}', omio: null });
  });
});

describe('airaloUrl', () => {
  it('the country page, or null where Airalo has none', () => {
    expect(airaloUrl('CZ', none)).toBe('https://www.airalo.com/czech-republic-esim');
    expect(airaloUrl('ZZ', none)).toBeNull();
  });
});

describe('esimHomeLine (review focus 5)', () => {
  const today = '2026-11-12';
  it('in the 7 days before an international trip: the first country + how many more', () => {
    expect(esimHomeLine(trip(['CZ', 'HU', 'AT', 'DE', 'NL'], '2026-11-18'), today, true, 'US', false)).toEqual({ label: 'Staying connected? eSIMs for Czechia and 4 more', firstCountry: 'CZ' });
    expect(esimHomeLine(trip(['JP'], '2026-11-19'), today, true, 'US', false)?.label).toBe('Staying connected? eSIMs for Japan');
  });
  it('also while the trip is under way', () => {
    expect(esimHomeLine({ ...(trip(['JP'], '2026-11-10') as object), endDate: { toDate: () => new Date('2026-11-20T12:00:00Z') } } as never, today, true, 'US', false)).not.toBeNull();
  });
  it('nothing 8+ days out, undated, dismissed, domestic, or for non-members', () => {
    expect(esimHomeLine(trip(['JP'], '2026-11-20'), today, true, 'US', false)).toBeNull();
    expect(esimHomeLine(trip(['JP'], null), today, true, 'US', false)).toBeNull();
    expect(esimHomeLine(trip(['JP'], '2026-11-15'), today, true, 'US', true)).toBeNull();
    expect(esimHomeLine(trip(['US'], '2026-11-15'), today, true, 'US', false)).toBeNull();
    expect(esimHomeLine(trip(['JP'], '2026-11-15'), today, false, 'US', false)).toBeNull();
  });
});
