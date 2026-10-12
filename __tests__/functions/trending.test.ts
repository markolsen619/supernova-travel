import {
  TREND_MIN, capCommunity, composeHeat, destinationPoints, heatWrite, pruneTrendDays, sameDestinationPoints,
  trendDayKey, trendNewSlugs, trendPoints, trendTotal, trendWeight,
} from '../../functions/src/trending';

const NOW = new Date('2026-10-11T15:00:00Z');

describe('trendDayKey', () => {
  it('is the UTC day', () => expect(trendDayKey(new Date('2026-10-11T23:30:00-07:00'))).toBe('2026-10-12'));
});

describe('trendNewSlugs', () => {
  it('counts every city of a new trip, and a city a later write adds', () => {
    expect(trendNewSlugs([], ['lisbon', 'porto'])).toEqual(['lisbon', 'porto']);
    expect(trendNewSlugs(['lisbon'], ['lisbon', 'porto'])).toEqual(['porto']);
  });
  it('counts nothing for an unchanged trip or a removed city', () => {
    expect(trendNewSlugs(['lisbon'], ['lisbon'])).toEqual([]);
    expect(trendNewSlugs(['lisbon', 'porto'], ['lisbon'])).toEqual([]);
  });
  // Review: comparing only neighbouring writes let one trip remove and re-add a city to be counted
  // again and again. The first argument is now every city this trip was ever counted for.
  it('never counts a trip twice for the same city, even after removing and re-adding it', () => {
    expect(trendNewSlugs(['lisbon', 'porto'], ['porto'])).toEqual([]);
    expect(trendNewSlugs(['lisbon', 'porto'], ['porto', 'lisbon', 'madrid'])).toEqual(['madrid']);
  });
});

describe('destinationPoints', () => {
  it('reads the destination and its additional stops, nulls kept for ungrounded ones', () => {
    expect(destinationPoints({ destination: { lat: 1, lng: 2 }, additionalDestinations: [{ lat: null, lng: null }] }))
      .toEqual([{ lat: 1, lng: 2 }, { lat: null, lng: null }]);
    expect(destinationPoints({ destination: null })).toEqual([{ lat: null, lng: null }]);
  });
});

describe('sameDestinationPoints', () => {
  it('lets the trigger skip writes that move no destination', () => {
    const t = { destination: { lat: 1, lng: 2 } };
    expect(sameDestinationPoints(t, { destination: { lat: 1, lng: 2 } })).toBe(true);
    expect(sameDestinationPoints(t, { destination: { lat: 1, lng: 3 } })).toBe(false);
    expect(sameDestinationPoints(null, t)).toBe(false);
  });
});

describe('trendTotal', () => {
  it('sums the last 14 UTC days, today included', () => {
    expect(trendTotal({ '2026-10-11': 2, '2026-09-28': 3, '2026-09-27': 50 }, NOW)).toBe(5);
  });
  it('ignores days in the future', () => {
    expect(trendTotal({ '2026-10-12': 9, '2026-10-10': 1 }, NOW)).toBe(1);
  });
});

describe('trendWeight', () => {
  it('is nothing under the threshold, so one private trip can never be spotted', () => {
    expect(trendWeight(TREND_MIN - 1)).toBe(0);
    expect(trendWeight(0)).toBe(0);
  });
  // Review: a weight that differed for every count let anyone watching the heat read a city's exact
  // count and see a single private trip arrive. Four broad bands: one trip almost never changes it.
  it('shows only broad bands, so one more trip rarely changes what anyone sees', () => {
    expect([3, 4, 5].map(trendWeight)).toEqual([24, 24, 24]);
    expect([6, 10, 15].map(trendWeight)).toEqual([48, 48, 48]);
    expect([16, 50].map(trendWeight)).toEqual([72, 72]);
    expect([51, 500].map(trendWeight)).toEqual([96, 96]);
  });
});

describe('trendPoints', () => {
  const dest = { slug: 'lisbon', bbox: { sw: [-9.3, 38.6] as [number, number], ne: [-9.0, 38.8] as [number, number] } };
  it('spreads the weight over five points in the middle of the city, the same each time', () => {
    const p = trendPoints(dest, 10);
    expect(p).toHaveLength(5);
    expect(p.every(([lng, lat, w]) => lng > -9.25 && lng < -9.05 && lat > 38.63 && lat < 38.77 && w === 10)).toBe(true);
    expect(trendPoints(dest, 10)).toEqual(p);
  });
  it('adds nothing for a city with no weight', () => expect(trendPoints(dest, 0)).toEqual([]));
});

describe('pruneTrendDays', () => {
  it('keeps only the window', () => {
    expect(pruneTrendDays({ '2026-10-11': 1, '2026-09-28': 1, '2026-09-27': 1 }, NOW)).toEqual({ '2026-10-11': 1, '2026-09-28': 1 });
  });
});

describe('composeHeat', () => {
  it('with no trending, is exactly baseline plus community, heaviest first', () => {
    expect(composeHeat([[1, 1, 5]], [], [[2, 2, 9]])).toEqual([[2, 2, 9], [1, 1, 5]]);
  });
  it('adds trending points and caps the total', () => {
    expect(composeHeat([[1, 1, 5]], [[3, 3, 24]], [[2, 2, 9]], 2)).toEqual([[3, 3, 24], [2, 2, 9]]);
  });
});

describe('heatWrite', () => {
  // Shipping day: refreshTrending ran before the daily job had saved its community points, read them
  // as empty, and replaced 1,259 heat points with the 150 baseline ones. Without the saved points it
  // must leave the heat alone.
  it('leaves the heat alone until the daily job has saved its community points', () => {
    expect(heatWrite({ hasCommunity: false, current: [1, 2, 3], next: [1, 1, 1] })).toBe('skip');
  });
  it('writes only when the points changed', () => {
    expect(heatWrite({ hasCommunity: true, current: [1, 2, 3], next: [1, 2, 3] })).toBe('skip');
    expect(heatWrite({ hasCommunity: true, current: [1, 2, 3], next: [1, 2, 4] })).toBe('write');
    expect(heatWrite({ hasCommunity: true, current: undefined, next: [1, 2, 3] })).toBe('write');
  });
});

describe('capCommunity', () => {
  // Review: every public stop was saved, uncapped, in one document; past ~40k stops Firestore would
  // refuse it and take the whole daily batch down. Only the heaviest 4000 are ever drawn.
  it('keeps only the heaviest points the heat can draw', () => {
    expect(capCommunity([[1, 1, 1], [2, 2, 9], [3, 3, 5]], 2)).toEqual([[2, 2, 9], [3, 3, 5]]);
  });
});
