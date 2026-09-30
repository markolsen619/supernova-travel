import {
  destinationKeysFor, sameKeys, isAggregatable, rankTopPlaces, baselinePoints, buildHeatPoints,
  isEditorialTrip, stopDestinationKeys,
} from '../../functions/src/discovery';

const tuscany = { slug: 'tuscany', bbox: { sw: [9.7, 42.2], ne: [12.4, 44.5] } as { sw: [number, number]; ne: [number, number] } };
const florence = { slug: 'florence', bbox: { sw: [11.15, 43.72], ne: [11.33, 43.83] } as { sw: [number, number]; ne: [number, number] } };
const lisbon = { slug: 'lisbon', bbox: { sw: [-9.23, 38.69], ne: [-9.09, 38.80] } as { sw: [number, number]; ne: [number, number] } };

describe('destinationKeysFor', () => {
  it('tags a trip with every destination box it touches, including overlaps', () => {
    expect(destinationKeysFor([{ lat: 43.77, lng: 11.25 }], [lisbon, tuscany, florence])).toEqual(['florence', 'tuscany']);
  });

  it('ignores ungrounded points and places outside every box', () => {
    expect(destinationKeysFor([{ lat: null, lng: null }, { lat: 0, lng: 0 }], [lisbon])).toEqual([]);
  });

  it('lists each destination once however many stops fall in it', () => {
    expect(destinationKeysFor([{ lat: 38.72, lng: -9.14 }, { lat: 38.71, lng: -9.13 }], [lisbon])).toEqual(['lisbon']);
  });
});

describe('sameKeys', () => {
  it('lets the trigger skip a write that would change nothing (no self-retrigger loop)', () => {
    expect(sameKeys(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameKeys(undefined, [])).toBe(true);
    expect(sameKeys(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('isAggregatable', () => {
  it('counts only public, visible, tagged trips', () => {
    expect(isAggregatable({ visibility: 'public', destinationKeys: ['lisbon'] })).toBe(true);
    expect(isAggregatable({ visibility: 'private', destinationKeys: ['lisbon'] })).toBe(false);
    expect(isAggregatable({ visibility: 'public', moderationHidden: true, destinationKeys: ['lisbon'] })).toBe(false);
    expect(isAggregatable({ visibility: 'public', destinationKeys: [] })).toBe(false);
  });
});

describe('rankTopPlaces', () => {
  const s = (name: string, tripId: string, over: Partial<{ placeId: string | null; saves: number; lat: number; lng: number }> = {}) => ({
    placeId: null, name, type: 'activity', lat: 38.7, lng: -9.14, tripId, saves: 0, ...over,
  });

  it('ranks by how many itineraries include the place, counting each trip once', () => {
    const top = rankTopPlaces([
      s('Belém Tower', 't1'), s('Belém Tower', 't2'), s('Belém Tower', 't2'),
      s('LX Factory', 't1'),
    ]);
    expect(top.map((p) => [p.name, p.itineraryCount])).toEqual([['Belém Tower', 2], ['LX Factory', 1]]);
  });

  it('merges by Google place id when there is one', () => {
    const top = rankTopPlaces([s('Torre de Belém', 't1', { placeId: 'P1' }), s('Belém Tower', 't2', { placeId: 'P1' })]);
    expect(top).toHaveLength(1);
    expect(top[0].itineraryCount).toBe(2);
  });

  it('lists only places to go — not hotels, flights or transport hubs', () => {
    const top = rankTopPlaces([
      { ...s('Hotel Mundial', 't1'), type: 'hotel' },
      { ...s('Lisbon Airport', 't1'), type: 'flight' },
      { ...s('Rossio Station', 't2'), type: 'transport' },
      { ...s('Belém Tower', 't1'), type: 'activity' },
      { ...s('A Brasileira', 't2'), type: 'restaurant' },
    ]);
    expect(top.map((p) => p.name).sort()).toEqual(['A Brasileira', 'Belém Tower']);
  });

  it('breaks ties by saves and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`P${i}`, `t${i}`, { saves: i, lat: 38 + i / 100 }));
    const top = rankTopPlaces(many, 12);
    expect(top).toHaveLength(12);
    expect(top[0].name).toBe('P19');
  });
});

describe('baselinePoints', () => {
  it('spreads a destination over five stable points inside its box', () => {
    const pts = baselinePoints({ slug: 'lisbon', popularity: 80, bbox: lisbon.bbox });
    expect(pts).toHaveLength(5);
    expect(baselinePoints({ slug: 'lisbon', popularity: 80, bbox: lisbon.bbox })).toEqual(pts);
    for (const [lng, lat, w] of pts) {
      expect(lng).toBeGreaterThanOrEqual(-9.23);
      expect(lng).toBeLessThanOrEqual(-9.09);
      expect(lat).toBeGreaterThanOrEqual(38.69);
      expect(lat).toBeLessThanOrEqual(38.80);
      expect(w).toBe(16);
    }
  });
});

describe('buildHeatPoints', () => {
  it('weights community stops by saves and likes, rounds, and caps the total', () => {
    const pts = buildHeatPoints([[1, 2, 10]], [{ lat: 38.123456, lng: -9.654321, saves: 2, likes: 1 }]);
    expect(pts).toContainEqual([-9.6543, 38.1235, 6]);
    expect(pts).toContainEqual([1, 2, 10]);
    const many = Array.from({ length: 5000 }, (_, i) => ({ lat: i / 1000, lng: 0, saves: 0, likes: 0 }));
    expect(buildHeatPoints([[5, 5, 99]], many, 4000)).toHaveLength(4000);
    expect(buildHeatPoints([[5, 5, 99]], many, 4000)[0]).toEqual([5, 5, 99]);
  });
});

describe('isEditorialTrip', () => {
  it('trusts the flag only on trips by the editorial account', () => {
    // A user setting isEditorial on their own trip must not be treated as editorial.
    expect(isEditorialTrip({ isEditorial: true, authorUid: 'ED' }, 'ED')).toBe(true);
    expect(isEditorialTrip({ isEditorial: true, authorUid: 'someone' }, 'ED')).toBe(false);
    expect(isEditorialTrip({ authorUid: 'ED' }, 'ED')).toBe(false);
    expect(isEditorialTrip({ isEditorial: true, authorUid: 'ED' }, '')).toBe(false);
  });
});

describe('stopDestinationKeys', () => {
  it('credits a stop only to the destinations it is actually in', () => {
    // A Lisbon + Porto trip used to put Porto restaurants in Lisbon's top places.
    const porto = { slug: 'porto', bbox: { sw: [-8.7, 41.1], ne: [-8.5, 41.2] } as { sw: [number, number]; ne: [number, number] } };
    expect(stopDestinationKeys({ lat: 41.15, lng: -8.61 }, ['lisbon', 'porto'], [lisbon, porto])).toEqual(['porto']);
    expect(stopDestinationKeys({ lat: 38.72, lng: -9.14 }, ['lisbon', 'porto'], [lisbon, porto])).toEqual(['lisbon']);
  });

  it('only credits destinations the trip is tagged with', () => {
    expect(stopDestinationKeys({ lat: 38.72, lng: -9.14 }, ['porto'], [lisbon])).toEqual([]);
  });
});
