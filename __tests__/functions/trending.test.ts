import {
  TREND_MIN, composeHeat, destinationPoints, pruneTrendDays, sameDestinationPoints,
  trendDayKey, trendNewSlugs, trendPoints, trendTotal, trendWeight,
} from '../../functions/src/trending';

const NOW = new Date('2026-10-11T15:00:00Z');

describe('trendDayKey', () => {
  it('is the UTC day', () => expect(trendDayKey(new Date('2026-10-11T23:30:00-07:00'))).toBe('2026-10-12'));
});

describe('trendNewSlugs', () => {
  it('counts every city of a new trip, and only a city a later write adds', () => {
    expect(trendNewSlugs([], ['lisbon', 'porto'])).toEqual(['lisbon', 'porto']);
    expect(trendNewSlugs(['lisbon'], ['lisbon', 'porto'])).toEqual(['porto']);
  });
  it('counts nothing for an unchanged trip or a removed city', () => {
    expect(trendNewSlugs(['lisbon'], ['lisbon'])).toEqual([]);
    expect(trendNewSlugs(['lisbon', 'porto'], ['lisbon'])).toEqual([]);
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
  it('grows with planning, more slowly as it grows', () => {
    expect(trendWeight(3)).toBe(24);
    expect(trendWeight(15)).toBe(48);
    expect(trendWeight(255)).toBe(96);
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
