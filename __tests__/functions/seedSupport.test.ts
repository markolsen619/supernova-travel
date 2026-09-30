import {
  mapboxPlaceUrl, parsePlaceFeature, mapboxPoiUrl, googleTextSearchBody, parseGooglePlace, coverPhotoUrl, padBox,
  parsePoiFeature, plausibleMatch,
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

describe('parsePoiFeature', () => {
  it('returns a business result with its name', () => {
    expect(parsePoiFeature({ features: [{ geometry: { coordinates: [-9.2, 38.7] }, properties: { name: 'Pastéis de Belém', feature_type: 'poi' } }] }))
      .toEqual({ lng: -9.2, lat: 38.7, name: 'Pastéis de Belém' });
  });

  it('rejects a city, neighbourhood or address — a stop pinned to the city centre is wrong', () => {
    expect(parsePoiFeature({ features: [{ geometry: { coordinates: [135.7, 35.0] }, properties: { name: 'Kyoto', feature_type: 'place' } }] })).toBeNull();
    expect(parsePoiFeature({ features: [{ geometry: { coordinates: [0, 0] }, properties: { name: 'Rua X 12', feature_type: 'address' } }] })).toBeNull();
  });
});

describe('plausibleMatch', () => {
  it('accepts the venue the stop names, accents and punctuation aside', () => {
    expect(plausibleMatch('Pasteis de Belem, Lisbon', 'Pastéis de Belém')).toBe(true);
    expect(plausibleMatch('Katsukura Kyoto-eki Building, Kyoto', 'Katsukura - Kyoto Porta')).toBe(true);
    expect(plausibleMatch('Hotel Granvia Kyoto', 'Hotel Granvia Kyoto')).toBe(true);
  });

  it('rejects a different business that happens to be nearby', () => {
    expect(plausibleMatch('Restaurante O Zagalo, Lisbon', 'O Triplicado')).toBe(false);
    expect(plausibleMatch('Lisbon Destination Hostel, Lisbon', 'Holiday apartment | Close to Santa Justa Lift')).toBe(false);
  });

  it('rejects another branch of the same chain across town', () => {
    expect(plausibleMatch('Katsukura Kyoto-Ekimae, Kyoto', 'Katsukura Tonkatsu Sanjo Main Store')).toBe(false);
  });

  it('rejects a listing that merely mentions the landmark in its name', () => {
    // A holiday rental titled "… Close to Santa Justa Lift" became Lisbon's top place.
    expect(plausibleMatch('Santa Justa Lift, Lisbon', 'Holiday apartment | Close to Santa Justa Lift')).toBe(false);
    expect(plausibleMatch('A Merendinha do Arco, Lisbon', 'A Merendinha do Arco Bandeira')).toBe(true);
  });

  it('does not count generic words or the city as a match', () => {
    expect(plausibleMatch('Hotel Mundial, Lisbon', 'Hotel Lisboa Plaza')).toBe(false);
    expect(plausibleMatch('Gion Karyo, Kyoto', 'Kyoto Tower')).toBe(false);
  });
});

describe('plausibleMatch — landmark words', () => {
  it('rejects a business that shares only a common landmark word', () => {
    expect(plausibleMatch('Park Güell, Barcelona', 'Park Hotel')).toBe(false);
    expect(plausibleMatch('Belem Tower, Lisbon', 'Tower Bar')).toBe(false);
  });

  it('accepts the landmark under its local name', () => {
    expect(plausibleMatch('Louvre Museum, Paris', 'Musée du Louvre')).toBe(true);
    expect(plausibleMatch('Park Güell, Barcelona', 'Park Güell')).toBe(true);
  });
});
