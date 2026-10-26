import { areaFromGeocode, poiFromSearchBox, stopFallbackName } from '@/utils/pastTripPlaces';

const at = { lat: 38.7139, lng: -9.1335 };
const feature = (name: string, lat: number, lng: number, cat: string[] = []) => ({
  properties: { name, feature_type: 'poi', poi_category: cat, coordinates: { latitude: lat, longitude: lng } },
});

describe('poiFromSearchBox', () => {
  it('the nearest named place within 100 m, typed by category', () => {
    const json = { features: [feature('Far café', 38.716, -9.1335, ['cafe']), feature('Castelo de São Jorge', 38.7139, -9.1334, ['castle', 'tourist attraction'])] };
    expect(poiFromSearchBox(json, at)).toEqual({ name: 'Castelo de São Jorge', type: 'activity' });
  });
  it('restaurants, cafés and bars are restaurants; hotels are hotels', () => {
    expect(poiFromSearchBox({ features: [feature('Taberna', 38.7139, -9.1335, ['restaurant'])] }, at)!.type).toBe('restaurant');
    expect(poiFromSearchBox({ features: [feature('Bar', 38.7139, -9.1335, ['bar'])] }, at)!.type).toBe('restaurant');
    expect(poiFromSearchBox({ features: [feature('Hotel X', 38.7139, -9.1335, ['hotel'])] }, at)!.type).toBe('hotel');
  });
  it('nothing within 100 m, or a broken answer → null', () => {
    expect(poiFromSearchBox({ features: [feature('Far', 38.72, -9.1335)] }, at)).toBeNull();
    expect(poiFromSearchBox(null, at)).toBeNull();
    expect(poiFromSearchBox({ features: [{}] }, at)).toBeNull();
  });
});

describe('areaFromGeocode', () => {
  it('reads neighbourhood, city and country from a v6 reverse answer', () => {
    const json = { features: [{ properties: { feature_type: 'neighborhood', name: 'Alfama', context: { place: { name: 'Lisbon' }, country: { country_code: 'PT' } } } }] };
    expect(areaFromGeocode(json)).toEqual({ neighbourhood: 'Alfama', city: 'Lisbon', countryCode: 'PT' });
  });
  it('a place-level answer gives the city', () => {
    const json = { features: [{ properties: { feature_type: 'place', name: 'Sintra', context: { country: { country_code: 'pt' } } } }] };
    expect(areaFromGeocode(json)).toEqual({ neighbourhood: null, city: 'Sintra', countryCode: 'PT' });
  });
  it('nothing → all null', () => {
    expect(areaFromGeocode({})).toEqual({ neighbourhood: null, city: null, countryCode: null });
  });
});

it('fallback stop name', () => {
  expect(stopFallbackName(2)).toBe('Stop 3');
});
