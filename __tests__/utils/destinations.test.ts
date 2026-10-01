import {
  parseDestination, filterDestinations, findDestination, destinationEyebrow, matchDestinations,
  splitDestinationTrips, topPlaceToPlace, placeShare, type Destination,
} from '@/utils/destinations';
import type { Trip } from '@/types';

const raw = (over: Record<string, unknown> = {}) => ({
  slug: 'lisbon', name: 'Lisbon', countryCode: 'PT', countryName: 'Portugal', continentChip: 'europe',
  vibes: ['food', 'culture'], popularity: 82, center: { lat: 38.7, lng: -9.1 },
  coverImageUrl: 'https://x/photo', placeId: 'ChIJ', itineraryCount: 4,
  topPlaces: [{ name: 'Pastéis de Belém', type: 'restaurant', lat: 38.69, lng: -9.2, placeId: null, itineraryCount: 3 }],
  ...over,
});
const dest = (over: Record<string, unknown> = {}) => parseDestination(String(over.slug ?? 'lisbon'), raw(over)) as Destination;

describe('parseDestination', () => {
  it('reads a seeded document', () => {
    const d = dest();
    expect(d).toMatchObject({ slug: 'lisbon', name: 'Lisbon', continentChip: 'europe', itineraryCount: 4 });
    expect(d.topPlaces[0]).toEqual({ name: 'Pastéis de Belém', type: 'restaurant', lat: 38.69, lng: -9.2, placeId: null, itineraryCount: 3 });
  });
  it('rejects a document with no name or centre, and defaults the rest', () => {
    expect(parseDestination('x', { name: 'X' })).toBeNull();
    expect(parseDestination('x', { center: { lat: 1, lng: 2 } })).toBeNull();
    const d = parseDestination('x', { name: 'X', center: { lat: 1, lng: 2 } })!;
    expect(d).toMatchObject({ vibes: [], topPlaces: [], itineraryCount: 0, coverImageUrl: null, popularity: 0 });
  });
  it('drops top places that are not sights or restaurants or have no coordinates', () => {
    const d = dest({ topPlaces: [{ name: 'A', type: 'hotel', lat: 1, lng: 1, itineraryCount: 1 }, { name: 'B', type: 'activity', lat: null, lng: 1, itineraryCount: 1 }] });
    expect(d.topPlaces).toEqual([]);
  });
});

describe('filterDestinations', () => {
  const list = [
    dest({ slug: 'lisbon', popularity: 82 }),
    dest({ slug: 'tokyo', name: 'Tokyo', continentChip: 'asia', vibes: ['food', 'nightlife'], popularity: 97 }),
    dest({ slug: 'bali', name: 'Bali', continentChip: 'asia', vibes: ['beaches', 'nature'], popularity: 90 }),
  ];
  it('returns everything by popularity for All + All', () => {
    expect(filterDestinations(list, 'all', 'all').map((d) => d.slug)).toEqual(['tokyo', 'bali', 'lisbon']);
  });
  it('applies region and vibe together', () => {
    expect(filterDestinations(list, 'asia', 'food').map((d) => d.slug)).toEqual(['tokyo']);
  });
  it('returns an empty list when nothing matches', () => {
    expect(filterDestinations(list, 'oceania', 'nightlife')).toEqual([]);
  });
});

describe('findDestination', () => {
  it('finds by slug or returns null', () => {
    expect(findDestination([dest()], 'lisbon')?.name).toBe('Lisbon');
    expect(findDestination([dest()], 'atlantis')).toBeNull();
  });
});

describe('destinationEyebrow', () => {
  it('names the country and the itineraries', () => {
    expect(destinationEyebrow(dest())).toBe('PORTUGAL · 4 TRIPS');
    expect(destinationEyebrow(dest({ itineraryCount: 1 }))).toBe('PORTUGAL · 1 TRIP');
    expect(destinationEyebrow(dest({ itineraryCount: 0 }))).toBe('PORTUGAL');
  });
});

describe('matchDestinations', () => {
  const list = [dest(), dest({ slug: 'sao-paulo', name: 'São Paulo', countryName: 'Brazil', popularity: 60 }), dest({ slug: 'new-york-city', name: 'New York City', countryName: 'United States', popularity: 99 })];
  it('matches the start of any word, ignoring case and accents', () => {
    expect(matchDestinations(list, 'sao').map((d) => d.slug)).toEqual(['sao-paulo']);
    expect(matchDestinations(list, 'york').map((d) => d.slug)).toEqual(['new-york-city']);
    expect(matchDestinations(list, 'portu').map((d) => d.slug)).toEqual(['lisbon']);
  });
  it('needs two characters and caps the list', () => {
    expect(matchDestinations(list, 'l')).toEqual([]);
    expect(matchDestinations([...list, ...list, ...list], 'li', 2)).toHaveLength(2);
  });
});

describe('splitDestinationTrips', () => {
  const t = (id: string, isEditorial?: boolean) => ({ id, isEditorial }) as unknown as Trip;
  it('puts Supernova picks first, keeps order, and never lists a trip twice', () => {
    const out = splitDestinationTrips([t('a'), t('b', true), t('c'), t('b', true)]);
    expect(out.editorial.map((x) => x.id)).toEqual(['b']);
    expect(out.community.map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('topPlaceToPlace / placeShare', () => {
  const p = { name: 'Santa Justa Lift', type: 'activity' as const, lat: 38.71, lng: -9.14, placeId: null, itineraryCount: 3 };
  it('seeds a tier1 place with an empty id when there is no Google place', () => {
    expect(topPlaceToPlace(p)).toEqual({ placeId: '', name: 'Santa Justa Lift', address: '', lat: 38.71, lng: -9.14, countryCode: null, tier: 'tier1' });
    expect(topPlaceToPlace({ ...p, placeId: 'ChIJx' }).placeId).toBe('ChIJx');
  });
  it('says how many itineraries include it', () => {
    expect(placeShare(p, 4)).toBe('In 3 of 4 itineraries');
    expect(placeShare({ ...p, itineraryCount: 1 }, 1)).toBe('In 1 itinerary');
  });
});
