import { buildMapboxForwardUrl, normalizeMapboxFeature } from '@/utils/mapboxQuery';

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
    });
  });

  it('returns null when coordinates are missing', () => {
    expect(normalizeMapboxFeature({ properties: { name: 'x' } } as never)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeMapboxFeature(undefined)).toBeNull();
  });
});
