import { regionNameFor, regionFromMapboxFeature, tripPlaceLabel, type PlaceRegion } from '@/utils/tripRegion';

const r = (region: string | null, countryCode: string, countryName: string): PlaceRegion => ({ region, countryCode, countryName });

describe('regionNameFor', () => {
  it('names the shared state or province', () => {
    expect(regionNameFor([
      r('Baja California Sur', 'MX', 'Mexico'),
      r('Baja California Sur', 'MX', 'Mexico'),
      r('Baja California Sur', 'MX', 'Mexico'),
    ])).toBe('Baja California Sur');
  });

  it('falls back to the country when the states differ', () => {
    expect(regionNameFor([r('Lazio', 'IT', 'Italy'), r('Tuscany', 'IT', 'Italy'), r('Veneto', 'IT', 'Italy')])).toBe('Italy');
  });

  it('names the travel region several countries share', () => {
    expect(regionNameFor([r('Bavaria', 'DE', 'Germany'), r('Vienna', 'AT', 'Austria'), r('Prague', 'CZ', 'Czechia')]))
      .toBe('Central Europe');
    expect(regionNameFor([r(null, 'TH', 'Thailand'), r(null, 'VN', 'Vietnam'), r(null, 'KH', 'Cambodia')]))
      .toBe('Southeast Asia');
  });

  it('widens to the continent when the countries span travel regions', () => {
    expect(regionNameFor([r('Île-de-France', 'FR', 'France'), r('Bavaria', 'DE', 'Germany')])).toBe('Europe');
  });

  it('gives up across continents, and with fewer than two places', () => {
    expect(regionNameFor([r(null, 'JP', 'Japan'), r(null, 'US', 'United States')])).toBeNull();
    expect(regionNameFor([r('Baja California Sur', 'MX', 'Mexico')])).toBeNull();
  });

  it('ignores places it could not look up, as long as two remain', () => {
    expect(regionNameFor([r('Baja California Sur', 'MX', 'Mexico'), null, r('Baja California Sur', 'MX', 'Mexico')]))
      .toBe('Baja California Sur');
    expect(regionNameFor([r('Baja California Sur', 'MX', 'Mexico'), null])).toBeNull();
  });
});

describe('regionFromMapboxFeature', () => {
  it('reads a city’s state and country from its context', () => {
    expect(regionFromMapboxFeature({
      properties: {
        feature_type: 'place',
        name: 'Loreto',
        context: { region: { name: 'Baja California Sur' }, country: { name: 'Mexico', country_code: 'mx' } },
      },
    })).toEqual(r('Baja California Sur', 'MX', 'Mexico'));
  });

  it('uses the feature itself when the destination is a region', () => {
    expect(regionFromMapboxFeature({
      properties: { feature_type: 'region', name: 'Tuscany', context: { country: { name: 'Italy', country_code: 'IT' } } },
    })).toEqual(r('Tuscany', 'IT', 'Italy'));
  });

  it('returns null without a country', () => {
    expect(regionFromMapboxFeature({ properties: { name: 'x' } })).toBeNull();
    expect(regionFromMapboxFeature(undefined)).toBeNull();
  });
});

describe('tripPlaceLabel', () => {
  const dest = (name: string) => ({ name });

  it('uses the saved region for a multi-stop trip', () => {
    expect(tripPlaceLabel({ destination: dest('Loreto'), additionalDestinations: [dest('La Paz')], regionName: 'Baja California Sur' }))
      .toBe('Baja California Sur');
  });

  it('names every stop until the region is known', () => {
    expect(tripPlaceLabel({ destination: dest('Loreto'), additionalDestinations: [dest('La Paz'), dest('Cabo San Lucas')] }))
      .toBe('Loreto, La Paz & Cabo San Lucas');
    expect(tripPlaceLabel({ destination: dest('Loreto'), additionalDestinations: [dest('La Paz')], regionName: '' }))
      .toBe('Loreto & La Paz');
    expect(tripPlaceLabel({
      destination: dest('Paris'),
      additionalDestinations: [dest('Lyon'), dest('Nice'), dest('Bordeaux')],
    })).toBe('Paris, Lyon + 2 more');
  });

  it('copes with a saved record that has no additionalDestinations', () => {
    // Bookmarked posts and pre-multi-destination trip snapshots (useSavePost)
    // lack the field; the Saved tab crashed rendering them.
    expect(tripPlaceLabel({ destination: dest('Lisbon') } as never)).toBe('Lisbon');
  });

  it('is just the destination for a single-stop trip', () => {
    expect(tripPlaceLabel({ destination: dest('Lisbon'), additionalDestinations: [] })).toBe('Lisbon');
  });
});
