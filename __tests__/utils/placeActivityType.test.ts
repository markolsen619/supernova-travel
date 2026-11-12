import { activityTypeForPlace } from '@/utils/placeActivityType';

describe('activityTypeForPlace (2026-11-11: hotels added by search were saved as sights)', () => {
  it('a hotel is a hotel stop', () => {
    expect(activityTypeForPlace({ primaryType: 'hotel', types: ['hotel', 'lodging', 'point_of_interest', 'establishment'] })).toBe('hotel');
    expect(activityTypeForPlace({ primaryType: null, types: ['lodging', 'point_of_interest', 'establishment'] })).toBe('hotel');
    expect(activityTypeForPlace({ primaryType: 'extended_stay_hotel', types: [] })).toBe('hotel');
    expect(activityTypeForPlace({ primaryType: 'bed_and_breakfast', types: [] })).toBe('hotel');
  });
  it('a hotel whose types also list its restaurant stays a hotel (primary type wins)', () => {
    expect(activityTypeForPlace({ primaryType: 'hotel', types: ['restaurant', 'lodging'] })).toBe('hotel');
  });
  it('restaurants, cafés and bars are restaurant stops', () => {
    expect(activityTypeForPlace({ primaryType: 'italian_restaurant', types: [] })).toBe('restaurant');
    expect(activityTypeForPlace({ primaryType: 'cafe', types: [] })).toBe('restaurant');
    expect(activityTypeForPlace({ primaryType: 'bar', types: [] })).toBe('restaurant');
    expect(activityTypeForPlace({ types: ['bakery', 'food', 'store'] })).toBe('restaurant');
  });
  it('a museum with a café inside stays a sight (a known primary type decides)', () => {
    expect(activityTypeForPlace({ primaryType: 'museum', types: ['museum', 'cafe', 'tourist_attraction'] })).toBe('activity');
  });
  it('stations are transport stops', () => {
    expect(activityTypeForPlace({ primaryType: 'train_station', types: [] })).toBe('transport');
    expect(activityTypeForPlace({ types: ['transit_station', 'point_of_interest'] })).toBe('transport');
  });
  it('sights, markets and anything unknown stay sightseeing stops', () => {
    expect(activityTypeForPlace({ primaryType: 'museum', types: ['museum', 'tourist_attraction'] })).toBe('activity');
    expect(activityTypeForPlace({ primaryType: 'market', types: [] })).toBe('activity');
    expect(activityTypeForPlace({})).toBe('activity');
    expect(activityTypeForPlace({ primaryType: 'hotel_de_ville_typo', types: undefined })).toBe('activity');
  });
});
