// Importing googlePlaces.ts pulls in @/services/firebase and AsyncStorage via
// placeCache.ts — mocked only so the module loads (see placeQuery.test.ts).
jest.mock('@/services/firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { tier2FieldsFromRaw, countryCodeFromComponents } from '@/services/places/googlePlaces';

describe('tier2FieldsFromRaw', () => {
  it("carries Google's name so an itinerary stop's sheet names the real place", () => {
    expect(tier2FieldsFromRaw({ displayName: { text: 'Hyatt Regency Mission Bay' } }).name)
      .toBe('Hyatt Regency Mission Bay');
  });

  it('leaves the name key out entirely when Google sends none', () => {
    // Callers spread this over the seed place; an explicit undefined would erase its name.
    expect('name' in tier2FieldsFromRaw({})).toBe(false);
  });
});

describe('countryCodeFromComponents', () => {
  it('finds the country component', () => {
    expect(countryCodeFromComponents([
      { shortText: 'Lisboa', types: ['locality'] },
      { shortText: 'PT', types: ['country', 'political'] },
    ])).toBe('PT');
  });

  it('survives a component Google sent without types', () => {
    // This threw "Cannot read property 'includes' of undefined" and failed
    // grounding for a Lisbon restaurant stop.
    expect(countryCodeFromComponents([{ shortText: 'x' } as never, { shortText: 'PT', types: ['country'] }])).toBe('PT');
    expect(countryCodeFromComponents(undefined)).toBeNull();
  });
});
