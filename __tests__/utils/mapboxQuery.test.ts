import { buildMapboxForwardUrl, nameOnlyRetry, normalizeMapboxFeature, pickBestFeature } from '@/utils/mapboxQuery';

describe('buildMapboxForwardUrl', () => {
  it('includes a hard bbox when given one', () => {
    const url = buildMapboxForwardUrl({
      query: 'Malecón', token: 'tok', bbox: [-110.42, 24.05, -110.24, 24.22],
    });
    expect(url).toContain('bbox=-110.42%2C24.05%2C-110.24%2C24.22');
    expect(url).toContain('q=Malec%C3%B3n');
    expect(url).toContain('limit=1');
  });

  it('omits bbox when none is given', () => {
    const url = buildMapboxForwardUrl({ query: 'Paris', token: 'tok' });
    expect(url).not.toContain('bbox=');
  });

  it('includes proximity and country when given', () => {
    const url = buildMapboxForwardUrl({
      query: 'La Paz', token: 'tok', proximity: { lat: 24.1, lng: -110.3 },
      country: 'mx', types: 'place',
    });
    expect(url).toContain('proximity=-110.3%2C24.1');
    expect(url).toContain('country=mx');
    expect(url).toContain('types=place');
  });
});

describe('normalizeMapboxFeature', () => {
  const feature = {
    geometry: { coordinates: [-110.31, 24.14] },
    properties: {
      name: 'Malecón de La Paz',
      full_address: 'Malecón, La Paz, BCS, Mexico',
      mapbox_id: 'dXJuOm1i',
      context: { country: { country_code: 'MX' } },
    },
  };

  it('maps a feature to a GroundedPlace with source mapbox', () => {
    expect(normalizeMapboxFeature(feature)).toEqual({
      name: 'Malecón de La Paz',
      lat: 24.14,
      lng: -110.31,
      address: 'Malecón, La Paz, BCS, Mexico',
      countryCode: 'MX',
      source: 'mapbox',
      placeId: null,
      mapboxId: 'dXJuOm1i',
      isVenue: false,
    });
  });

  it('marks a point of interest as a venue', () => {
    const poi = { ...feature, properties: { ...feature.properties, feature_type: 'poi' } };
    expect(normalizeMapboxFeature(poi)?.isVenue).toBe(true);
  });

  it('returns null when coordinates are missing', () => {
    expect(normalizeMapboxFeature({ properties: { name: 'x' } } as never)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeMapboxFeature(undefined)).toBeNull();
  });
});

describe('pickBestFeature', () => {
  const f = (name: string) => ({ properties: { name } });
  it('takes the result named like the place, not one that only shares the city', () => {
    const list = [f('San Diego International Airport'), f('Belmont Park')];
    expect(pickBestFeature('Belmont Park, San Diego', list)?.properties?.name).toBe('Belmont Park');
  });
  it('keeps the first result when nothing names the place better', () => {
    const list = [f('Hotel del Coronado'), f('Coronado Beach')];
    expect(pickBestFeature('Hotel del Coronado, San Diego', list)?.properties?.name).toBe('Hotel del Coronado');
    expect(pickBestFeature('somewhere', [f('A'), f('B')])?.properties?.name).toBe('A');
    expect(pickBestFeature('x', [])).toBeUndefined();
  });
});

describe('nameOnlyRetry', () => {
  const f = (name: string) => ({ properties: { name } });
  // Mapbox, boxed to San Diego with a city-centre proximity, answered "Belmont Park, San Diego"
  // with the airport alone — the city words outranked the place's. The name alone finds it.
  it('asks again by the name alone when the answer shares none of its words', () => {
    expect(nameOnlyRetry('Belmont Park, San Diego', f('San Diego International Airport'))).toBe('Belmont Park');
    expect(nameOnlyRetry('Belmont Park, San Diego', undefined)).toBe('Belmont Park');
  });
  it('keeps an answer named like the place', () => {
    expect(nameOnlyRetry('Belmont Park, San Diego', f('Belmont Park'))).toBeNull();
    expect(nameOnlyRetry('Giant Dipper, Belmont Park', f('Giant Dipper Roller Coaster'))).toBeNull();
  });
  it('has nothing to retry without a suffix', () => {
    expect(nameOnlyRetry('Belmont Park', f('San Diego International Airport'))).toBeNull();
    expect(nameOnlyRetry(', San Diego', undefined)).toBeNull();
  });
});
