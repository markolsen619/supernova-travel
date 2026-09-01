import type { Trip, Destination } from '@/types';
import { aggregateDestinations } from '@/utils/trendingPlaces';

function dest(over: Partial<Destination> = {}): Destination {
  return { name: 'Paris', placeId: 'p_paris', lat: 48.8566, lng: 2.3522, countryCode: 'FR', bounds: null, ...over };
}

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    destination: dest(),
    additionalDestinations: [],
    savesCount: 0,
    likesCount: 0,
    ...over,
  } as unknown as Trip;
}

describe('aggregateDestinations', () => {
  it('returns one entry per distinct place', () => {
    const out = aggregateDestinations([trip({ id: 'a' }), trip({ id: 'b' })]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Paris');
  });

  it('counts how many trips go to a place', () => {
    const out = aggregateDestinations([trip({ id: 'a' }), trip({ id: 'b' }), trip({ id: 'c' })]);
    expect(out[0].tripCount).toBe(3);
  });

  it('sums saves and likes into the weight', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', savesCount: 5, likesCount: 2 }),
      trip({ id: 'b', savesCount: 1, likesCount: 1 }),
    ]);
    expect(out[0].weight).toBe(9);
  });

  it('dedupes on placeId even when coordinates differ slightly', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ lat: 48.8566, lng: 2.3522 }) }),
      trip({ id: 'b', destination: dest({ lat: 48.8570, lng: 2.3530 }) }),
    ]);
    expect(out).toHaveLength(1);
  });

  // AI-generated trips can carry a name with no placeId until useTripCoverResolver
  // grounds them, so coordinates are the fallback identity.
  it('dedupes on rounded coordinates when placeId is null', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ placeId: null, lat: 48.85664, lng: 2.35221 }) }),
      trip({ id: 'b', destination: dest({ placeId: null, lat: 48.85661, lng: 2.35223 }) }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].tripCount).toBe(2);
  });

  it('drops destinations with no coordinates — they cannot be placed on a map', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ lat: null, lng: null, placeId: null }) }),
    ]);
    expect(out).toEqual([]);
  });

  it('includes additionalDestinations from multi-destination trips', () => {
    const out = aggregateDestinations([
      trip({
        id: 'a',
        additionalDestinations: [dest({ name: 'Lyon', placeId: 'p_lyon', lat: 45.76, lng: 4.83 })],
      }),
    ]);
    expect(out.map((p) => p.name).sort()).toEqual(['Lyon', 'Paris']);
  });

  it('sorts by weight, heaviest first', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ name: 'Paris', placeId: 'p_paris' }), savesCount: 1 }),
      trip({ id: 'b', destination: dest({ name: 'Tokyo', placeId: 'p_tokyo' }), savesCount: 99 }),
    ]);
    expect(out[0].name).toBe('Tokyo');
  });

  it('breaks ties deterministically so pins never reshuffle between renders', () => {
    const build = () =>
      aggregateDestinations([
        trip({ id: 'a', destination: dest({ name: 'Zurich', placeId: 'p_z' }), savesCount: 3 }),
        trip({ id: 'b', destination: dest({ name: 'Athens', placeId: 'p_a' }), savesCount: 3 }),
      ]);
    expect(build().map((p) => p.name)).toEqual(build().map((p) => p.name));
    expect(build()[0].name).toBe('Athens');
  });

  it('truncates to the limit, keeping the heaviest', () => {
    const trips = Array.from({ length: 60 }, (_, i) =>
      trip({ id: `t${i}`, destination: dest({ name: `City${i}`, placeId: `p${i}` }), savesCount: i }),
    );
    const out = aggregateDestinations(trips, 50);
    expect(out).toHaveLength(50);
    expect(out[0].name).toBe('City59');
  });

  it('returns an empty array for no trips', () => {
    expect(aggregateDestinations([])).toEqual([]);
  });
});
