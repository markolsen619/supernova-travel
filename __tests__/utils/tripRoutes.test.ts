import {
  haversineMeters, legMode, legKey, greatCircleArc, decodePolyline6, buildPath, pointAlongPath, markerStops, overviewDots,
  type RouteStop, type LegCache,
} from '@/utils/tripRoutes';

const stop = (id: string, lat: number, lng: number, over: Partial<RouteStop> = {}): RouteStop => ({
  id, type: 'activity', title: '', notes: '', lat, lng, ...over,
});

describe('haversineMeters', () => {
  it('measures a known distance', () => {
    // La Paz → Cabo San Lucas is ~135 km as the crow flies.
    const m = haversineMeters({ lat: 24.1426, lng: -110.3128 }, { lat: 22.8905, lng: -109.9167 });
    expect(m).toBeGreaterThan(130_000);
    expect(m).toBeLessThan(145_000);
  });
});

describe('legMode', () => {
  it('walks short hops and drives longer ones', () => {
    expect(legMode(stop('a', 38.7, -9.14), stop('b', 38.705, -9.14))).toBe('walking');
    expect(legMode(stop('a', 38.7, -9.14), stop('b', 38.8, -9.3))).toBe('driving');
  });

  it('draws flights, ferries and very long legs as arcs', () => {
    const far = stop('b', 40.7, -74.0);
    expect(legMode(stop('a', 38.7, -9.14, { type: 'flight' }), stop('b', 38.8, -9.3))).toBe('arc');
    expect(legMode(stop('a', 32.7, -117.2, { type: 'transport', title: 'Ferry to Coronado' }), stop('b', 32.69, -117.17))).toBe('arc');
    expect(legMode(stop('a', 38.7, -9.14), far)).toBe('arc');
  });

  it('treats two stops at the same spot as a zero-length walk', () => {
    expect(legMode(stop('in', 24.1, -110.3, { type: 'hotel' }), stop('out', 24.1, -110.3, { type: 'hotel' }))).toBe('walking');
  });
});

describe('legKey', () => {
  it('changes when either end moves, and is stable to 5 decimals', () => {
    const a = { lat: 38.7, lng: -9.14 };
    expect(legKey('walking', a, { lat: 38.705, lng: -9.14 })).toBe(legKey('walking', a, { lat: 38.705000001, lng: -9.14 }));
    expect(legKey('walking', a, { lat: 38.705, lng: -9.14 })).not.toBe(legKey('walking', a, { lat: 38.706, lng: -9.14 }));
    expect(legKey('walking', a, { lat: 38.705, lng: -9.14 })).not.toBe(legKey('driving', a, { lat: 38.705, lng: -9.14 }));
  });
});

describe('greatCircleArc', () => {
  it('starts and ends on the two points', () => {
    const arc = greatCircleArc({ lat: 38.7, lng: -9.14 }, { lat: 40.7, lng: -74.0 }, 16);
    expect(arc[0][0]).toBeCloseTo(-9.14, 3);
    expect(arc[arc.length - 1][0]).toBeCloseTo(-74.0, 3);
    expect(arc).toHaveLength(17);
  });

  it('crosses the antimeridian the short way', () => {
    // Fiji (178°E) → Hawaii (157°W): every longitude step stays small.
    const arc = greatCircleArc({ lat: -17.7, lng: 178.0 }, { lat: 21.3, lng: -157.8 }, 32);
    for (let i = 1; i < arc.length; i++) {
      expect(Math.abs(arc[i][0] - arc[i - 1][0])).toBeLessThan(20);
    }
  });
});

describe('decodePolyline6', () => {
  it('decodes a two-point polyline6 as [lng, lat]', () => {
    // Encodes (38.5, -120.2), (40.7, -120.95) at precision 6.
    expect(decodePolyline6('_izlhA~rlgdF_{geC~ywl@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
    ]);
  });
});

describe('buildPath', () => {
  const a = stop('a', 38.70, -9.14);
  const b = stop('b', 38.80, -9.30);
  const c = stop('c', 38.801, -9.30);

  it('lists driving/walking legs missing from the cache and draws them as arcs meanwhile', () => {
    const path = buildPath([a, b, c], {});
    expect(path.missing.map((m) => m.mode)).toEqual(['driving', 'walking']);
    expect(path.coordinates[0]).toEqual([a.lng, a.lat]);
    expect(path.coordinates[path.coordinates.length - 1]).toEqual([c.lng, c.lat]);
  });

  it('uses a cached leg instead of an arc, and adds up its meters', () => {
    const cache: LegCache = {
      [legKey('driving', a, b)]: { mode: 'driving', polyline: '_izlhA~rlgdF_{geC~ywl@', meters: 20_000 },
    };
    const path = buildPath([a, b], cache);
    expect(path.missing).toEqual([]);
    expect(path.meters).toBe(20_000);
    expect(path.coordinates).toContainEqual([-120.95, 40.7]);
  });

  it('marks where each stop sits along the path, from 0 to 1', () => {
    const path = buildPath([a, b, c], {});
    expect(path.stopFractions[0]).toBe(0);
    expect(path.stopFractions[2]).toBe(1);
    expect(path.stopFractions[1]).toBeGreaterThan(0.9); // b→c is a few metres of a ~16 km path
  });

  it('handles zero or one stop without legs', () => {
    expect(buildPath([], {})).toEqual({ coordinates: [], stopFractions: [], meters: 0, missing: [] });
    expect(buildPath([a], {})).toEqual({ coordinates: [[a.lng, a.lat]], stopFractions: [0], meters: 0, missing: [] });
  });

  it('never requests a zero-length leg', () => {
    const same = stop('same', a.lat, a.lng);
    expect(buildPath([a, same], {}).missing).toEqual([]);
  });
});

describe('pointAlongPath', () => {
  const line: [number, number][] = [[0, 0], [0, 1], [1, 1]];

  it('returns the ends at 0 and 1', () => {
    expect(pointAlongPath(line, 0).point).toEqual([0, 0]);
    expect(pointAlongPath(line, 1).point).toEqual([1, 1]);
  });

  it('interpolates by distance and faces the direction of travel', () => {
    const mid = pointAlongPath(line, 0.25);
    expect(mid.point[0]).toBeCloseTo(0, 5);
    expect(mid.point[1]).toBeCloseTo(0.5, 2);
    expect(mid.bearing).toBeCloseTo(0, 0); // heading north
  });
});

describe('markerStops', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ id: `s${i}`, dayId: i < 5 ? 'd1' : 'd2' }));

  it('shows none at overview zoom', () => {
    expect(markerStops(10.9, many.slice(0, 3), null)).toEqual([]);
  });

  it('shows every stop close in when there are 40 or fewer', () => {
    expect(markerStops(11, many.slice(0, 40), null)).toHaveLength(40);
  });

  it('past 40, shows only the selected day, or none without a selection', () => {
    expect(markerStops(14, many, 'd1').map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(markerStops(14, many, null)).toEqual([]);
  });
});

describe('overviewDots', () => {
  const stops = Array.from({ length: 41 }, (_, i) => ({ id: `s${i}`, dayId: 'd1' }));

  it('draws every stop as a dot at overview when there are 40 or fewer', () => {
    expect(overviewDots(false, stops.slice(0, 40))).toHaveLength(40);
  });

  it('draws none close in (markers take over) or past 40 stops (the circle layer does)', () => {
    expect(overviewDots(true, stops.slice(0, 3))).toEqual([]);
    expect(overviewDots(false, stops)).toEqual([]);
  });
});
