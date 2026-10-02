// googlePlaces.ts imports the Firestore-backed place cache; mock what it pulls in.
jest.mock('@/services/firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));

import { placeSelectionFromDetails } from '@/services/places/googlePlaces';

// The real Places (New) Details response for the "Washington D.C." suggestion, 2026-10-01.
const dcDetails = {
  id: 'ChIJW-T2Wt7Gt4kRKl2I1CJFUsI',
  displayName: { text: 'Washington', languageCode: 'en' },
  location: { latitude: 38.9072873, longitude: -77.0369274 },
  addressComponents: [
    { longText: 'Washington', shortText: 'Washington', types: ['locality', 'political'] },
    { longText: 'District of Columbia', shortText: 'District of Columbia', types: ['administrative_area_level_2', 'political'] },
    { longText: 'District of Columbia', shortText: 'DC', types: ['administrative_area_level_1', 'political'] },
    { longText: 'United States', shortText: 'US', types: ['country', 'political'] },
  ],
};

describe('placeSelectionFromDetails', () => {
  it('names DC by the suggestion tapped, and nothing later overwrites it with "Washington"', () => {
    const s = placeSelectionFromDetails(dcDetails as never, 'fallback', 'tier1', 'Washington D.C.');
    expect(s.name).toBe('Washington D.C.');
    expect(s).toMatchObject({ placeId: 'ChIJW-T2Wt7Gt4kRKl2I1CJFUsI', lat: 38.9072873, lng: -77.0369274, countryCode: 'US', tier: 'tier1' });
  });
  it('without tapped text, still never comes out as the bare state name', () => {
    expect(placeSelectionFromDetails(dcDetails as never, 'fallback', 'tier1').name).toBe('Washington, DC');
  });
  it('uses Google\'s name for an ordinary place', () => {
    const lisbon = { id: 'L', displayName: { text: 'Lisbon' }, location: { latitude: 38.7, longitude: -9.1 }, addressComponents: [{ shortText: 'PT', types: ['country'] }] };
    expect(placeSelectionFromDetails(lisbon as never, 'L', 'tier1', 'Lisbon').name).toBe('Lisbon');
  });
});
