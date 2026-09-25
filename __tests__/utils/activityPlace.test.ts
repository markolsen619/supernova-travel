import { activityToPlace, canShowPlaceSheet } from '@/utils/activityPlace';
import type { TripActivity } from '@/types';

const activity = (over: Partial<TripActivity> = {}): TripActivity =>
  ({
    id: 'a1',
    type: 'restaurant',
    title: 'Cervejaria Ramiro',
    placeId: 'ChIJxyz',
    address: 'Av. Almirante Reis 1, Lisboa',
    lat: 38.72,
    lng: -9.13,
    order: 0,
  }) as TripActivity;

describe('canShowPlaceSheet', () => {
  it('is true for a stop with coordinates', () => {
    expect(canShowPlaceSheet(activity())).toBe(true);
  });

  it('is true for a Mapbox-grounded stop with no Google placeId', () => {
    // Grounded means "has coordinates", not "has a Google place" — mirrors
    // TripMapView's collectStops predicate. The sheet still shows name,
    // address and the map; it just cannot fetch photos or a rating.
    expect(canShowPlaceSheet({ ...activity(), placeId: null })).toBe(true);
  });

  it('is false for an ungrounded stop', () => {
    // An AI stop that has never been grounded has nothing to show and must
    // fall through to the existing grounding flow instead.
    expect(canShowPlaceSheet({ ...activity(), lat: null, lng: null })).toBe(false);
  });
});

describe('activityToPlace', () => {
  it('returns null when the stop has no coordinates', () => {
    expect(activityToPlace({ ...activity(), lat: null, lng: null })).toBeNull();
  });

  it('seeds the sheet from what the activity already knows', () => {
    const place = activityToPlace(activity());
    expect(place).toMatchObject({
      placeId: 'ChIJxyz',
      name: 'Cervejaria Ramiro',
      address: 'Av. Almirante Reis 1, Lisboa',
      lat: 38.72,
      lng: -9.13,
    });
  });

  it('marks the seed tier1 so the sheet fetches photos itself', () => {
    // PlaceDetailSheet upgrades a tier1 place to tier2 on open. Claiming
    // tier2 here would suppress that and leave the rail permanently empty.
    expect(activityToPlace(activity())?.tier).toBe('tier1');
  });

  it('falls back to an empty address rather than undefined', () => {
    expect(activityToPlace({ ...activity(), address: null })?.address).toBe('');
  });

  it('keeps an empty placeId for a Mapbox stop so no Places call is attempted', () => {
    // enrichPlaceById would 404 on a Mapbox id. Empty is the signal for
    // "nothing to upgrade", and placeCache short-circuits on it too.
    expect(activityToPlace({ ...activity(), placeId: null })?.placeId).toBe('');
  });
});
