import {
  mapboxPlaceUrl, parsePlaceFeature, mapboxPoiUrl, googleTextSearchBody, parseGooglePlace, coverPhotoUrl, padBox,
} from '../../functions/src/seedSupport';

describe('mapbox place lookup', () => {
  it('asks for a place, region or locality in the right country', () => {
    const url = new URL(mapboxPlaceUrl('Lisbon, Portugal', 'tok', 'PT'));
    expect(url.pathname).toBe('/search/searchbox/v1/forward');
    expect(url.searchParams.get('country')).toBe('pt');
    expect(url.searchParams.get('types')).toBe('place,region,locality,district');
  });

  it('reads the centre and box', () => {
    const f = parsePlaceFeature({ features: [{ geometry: { coordinates: [-9.14, 38.72] }, properties: { name: 'Lisbon', bbox: [-9.23, 38.69, -9.09, 38.80] } }] });
    expect(f).toEqual({ lng: -9.14, lat: 38.72, name: 'Lisbon', bbox: { sw: [-9.23, 38.69], ne: [-9.09, 38.80] } });
    expect(parsePlaceFeature({ features: [] })).toBeNull();
  });
});

describe('padBox', () => {
  it('keeps a large box and pads a missing or tiny one around the centre', () => {
    const big = { sw: [-9.3, 38.6], ne: [-9.0, 38.9] } as never;
    expect(padBox([-9.14, 38.72], big)).toBe(big);
    expect(padBox([10, 20], null)).toEqual({ sw: [9.9, 19.9], ne: [10.1, 20.1] });
  });
});

describe('stop grounding requests', () => {
  it('bounds the POI search to the destination box', () => {
    const url = new URL(mapboxPoiUrl('Belém Tower, Lisbon', 'tok', { sw: [-9.3, 38.6], ne: [-9.0, 38.9] }, [-9.14, 38.72]));
    expect(url.searchParams.get('bbox')).toBe('-9.3,38.6,-9,38.9');
    expect(url.searchParams.get('proximity')).toBe('-9.14,38.72');
  });

  it('biases a Google fallback to the centre', () => {
    expect(googleTextSearchBody('Belém Tower', [-9.14, 38.72])).toMatchObject({
      textQuery: 'Belém Tower', maxResultCount: 1,
      locationBias: { circle: { center: { latitude: 38.72, longitude: -9.14 } } },
    });
  });
});

describe('parseGooglePlace / coverPhotoUrl', () => {
  it('reads the first place and its first photo', () => {
    const p = parseGooglePlace({ places: [{ id: 'P1', displayName: { text: 'Lisbon' }, location: { latitude: 38.7, longitude: -9.1 }, photos: [{ name: 'places/P1/photos/abc' }] }] });
    expect(p).toEqual({ placeId: 'P1', name: 'Lisbon', lat: 38.7, lng: -9.1, photoName: 'places/P1/photos/abc' });
    expect(coverPhotoUrl('places/P1/photos/abc', 'K')).toBe('https://places.googleapis.com/v1/places/P1/photos/abc/media?maxWidthPx=1200&key=K');
    expect(parseGooglePlace({})).toBeNull();
  });
});
