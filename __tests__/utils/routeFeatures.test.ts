import { routeFeatures } from '@/utils/routeFeatures';
import { buildPath, type RouteStop } from '@/utils/tripRoutes';

const stop = (id: string, lat: number, lng: number, over: Partial<RouteStop> = {}): RouteStop => ({
  id, type: 'activity', title: '', notes: '', lat, lng, ...over,
});

describe('routeFeatures', () => {
  const lisbon = stop('lis', 38.77, -9.13, { type: 'flight', title: 'Flight to Madrid' });
  const madrid = stop('mad', 40.42, -3.70);
  const museum = stop('prado', 40.414, -3.692);
  const path = buildPath([lisbon, madrid, museum], {});

  it('emits one line per leg, tagged with how it is travelled', () => {
    const fc = routeFeatures([{ path, color: '#a78bfa', flightIndex: 0, faded: false }]);
    expect(fc.features.map((f) => f.properties?.travel)).toEqual(['flight', 'walk']);
    expect(fc.features.map((f) => f.properties?.legIdx)).toEqual([0, 1]);
  });

  it('gives a flight its cruising height and every leg its colour and index', () => {
    const [flight, walk] = routeFeatures([{ path, color: '#a78bfa', flightIndex: 2, faded: true }]).features;
    expect(flight.properties).toMatchObject({ color: '#a78bfa', flightIndex: 2, faded: true });
    expect(flight.properties?.alt).toBeGreaterThan(3_000);
    expect(walk.properties?.alt).toBe(0);
  });

  it('keeps each leg’s line from its first stop to its last', () => {
    const [flight] = routeFeatures([{ path, color: '#fff', flightIndex: 0, faded: false }]).features;
    const coords = (flight.geometry as GeoJSON.LineString).coordinates;
    expect(coords[0]).toEqual([lisbon.lng, lisbon.lat]);
    expect(coords[coords.length - 1][0]).toBeCloseTo(madrid.lng, 5);
  });

  it('skips paths with no legs', () => {
    expect(routeFeatures([{ path: buildPath([lisbon], {}), color: '#fff', flightIndex: 0, faded: false }]).features).toEqual([]);
  });
});
