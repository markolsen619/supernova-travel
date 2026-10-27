import { areaFromGeocode, poiFromSearchBox, stopFallbackName } from '@/utils/pastTripPlaces';

const at = { lat: 38.7139, lng: -9.1335 };
const feature = (name: string, lat: number, lng: number, cat: string[] = []) => ({
  properties: { name, feature_type: 'poi', poi_category: cat, coordinates: { latitude: lat, longitude: lng } },
});

describe('poiFromSearchBox', () => {
  it('the nearest named place within 100 m, typed by category', () => {
    const json = { features: [feature('Far café', 38.716, -9.1335, ['cafe']), feature('Castelo de São Jorge', 38.7139, -9.1334, ['castle', 'tourist attraction'])] };
    expect(poiFromSearchBox(json, at)).toEqual({ name: 'Castelo de São Jorge', type: 'activity', lat: 38.7139, lng: -9.1334 });
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
    expect(areaFromGeocode(json)).toEqual({ neighbourhood: 'Alfama', city: 'Lisbon', countryCode: 'PT', center: null });
  });
  it('a place-level answer gives the city', () => {
    const json = { features: [{ properties: { feature_type: 'place', name: 'Sintra', context: { country: { country_code: 'pt' } } } }] };
    expect(areaFromGeocode(json)).toEqual({ neighbourhood: null, city: 'Sintra', countryCode: 'PT', center: null });
  });
  it('nothing → all null', () => {
    expect(areaFromGeocode({})).toEqual({ neighbourhood: null, city: null, countryCode: null, center: null });
  });
});

it('fallback stop name', () => {
  expect(stopFallbackName(2)).toBe('Stop 3');
});

import { publicPosition } from '@/utils/pastTripPlaces';

describe('publicPosition (final review C1: never the photos\' own position)', () => {
  const raw = { lat: 38.713912, lng: -9.133471 };
  it('a matched place: its own position', () => {
    expect(publicPosition({ lat: 38.7139, lng: -9.1334 }, { lat: 38.71, lng: -9.13 }, raw)).toEqual({ lat: 38.7139, lng: -9.1334 });
  });
  it('no place: the neighbourhood centre', () => {
    expect(publicPosition(null, { lat: 38.71, lng: -9.13 }, raw)).toEqual({ lat: 38.71, lng: -9.13 });
  });
  it('nothing came back: rounded to about a kilometre', () => {
    expect(publicPosition(null, null, raw)).toEqual({ lat: 38.71, lng: -9.13 });
  });
});

describe('Mapbox answers carry their own positions', () => {
  it('a POI returns its coordinates', () => {
    const json = { features: [{ properties: { name: 'Castelo', poi_category: [], coordinates: { latitude: 38.7139, longitude: -9.1334 } } }] };
    expect(poiFromSearchBox(json, { lat: 38.7139, lng: -9.1335 })).toMatchObject({ lat: 38.7139, lng: -9.1334 });
  });
  it('an area returns its centre', () => {
    const json = { features: [{ geometry: { coordinates: [-9.13, 38.711] }, properties: { feature_type: 'neighborhood', name: 'Alfama', context: {} } }] };
    expect(areaFromGeocode(json).center).toEqual({ lat: 38.711, lng: -9.13 });
  });
});

import { stopNameFor } from '@/utils/pastTripPlaces';

describe('stopNameFor (owner 2026-10-26: never a random business — "Neighbourhood, City")', () => {
  it('neighbourhood and city', () => {
    expect(stopNameFor({ neighbourhood: 'Montmartre', city: 'Paris', country: 'France' })).toBe('Montmartre, Paris');
  });
  it('no neighbourhood: city and country', () => {
    expect(stopNameFor({ neighbourhood: null, city: 'Athlone', country: 'Ireland' })).toBe('Athlone, Ireland');
  });
  it('a neighbourhood named like its city is not repeated', () => {
    expect(stopNameFor({ neighbourhood: 'Paris', city: 'Paris', country: 'France' })).toBe('Paris, France');
  });
  it('neighbourhood but no city: with the country', () => {
    expect(stopNameFor({ neighbourhood: 'Alfama', city: null, country: 'Portugal' })).toBe('Alfama, Portugal');
  });
  it('nothing known: null (the caller falls back to "Stop n")', () => {
    expect(stopNameFor({ neighbourhood: null, city: null, country: null })).toBeNull();
    expect(stopNameFor({ neighbourhood: null, city: null, country: 'France' })).toBe('France');
  });
});

it('areaFromGeocode reads the country name too', () => {
  const json = { features: [{ properties: { feature_type: 'neighborhood', name: 'Montmartre', context: { place: { name: 'Paris' }, country: { country_code: 'FR', name: 'France' } } } }] };
  expect(areaFromGeocode(json).country).toBe('France');
});

it('an area whose name already holds the city is just "City, Country" (owner trip: "Athlone and Bigmeadow, Athlone")', () => {
  expect(stopNameFor({ neighbourhood: 'Athlone and Bigmeadow', city: 'Athlone', country: 'Ireland' })).toBe('Athlone, Ireland');
  expect(stopNameFor({ neighbourhood: 'Montmartre', city: 'Paris', country: 'France' })).toBe('Montmartre, Paris');
});
