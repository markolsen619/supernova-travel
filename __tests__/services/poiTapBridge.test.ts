import type * as GeoJSON from 'geojson';
import { extractPoiFromFeatures, makeCacheKey } from '@/services/places/poiTapBridge';

function point(name: string, lng: number, lat: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

function polygon(name: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    },
  };
}

function line(name: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  };
}

function multipoint(name: string, coords: Array<[number, number]>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'MultiPoint', coordinates: coords },
  };
}

function multipolygon(name: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
        [[[2, 2], [2, 3], [3, 3], [3, 2], [2, 2]]],
      ],
    },
  };
}

function collection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('extractPoiFromFeatures', () => {
  it('returns a named Point feature', () => {
    const poi = extractPoiFromFeatures(collection([point('Louvre', 2.3376, 48.8606)]), 48.8606, 2.3376);
    expect(poi?.name).toBe('Louvre');
    expect(poi?.lat).toBeCloseTo(48.8606);
    expect(poi?.lng).toBeCloseTo(2.3376);
  });

  // The bug this task exists to kill: a named polygon used to win and then
  // get sent to a billed Text Search.
  it('rejects a named polygon, such as an ocean or landuse area', () => {
    expect(extractPoiFromFeatures(collection([polygon('Pacific Ocean')]), 0, 0)).toBeNull();
  });

  it('rejects a named line, such as a road', () => {
    expect(extractPoiFromFeatures(collection([line('Rue de Rivoli')]), 0, 0)).toBeNull();
  });

  it('skips polygons and lines to reach a real Point behind them', () => {
    const poi = extractPoiFromFeatures(
      collection([polygon('Seine'), line('Rue de Rivoli'), point('Louvre', 2.3376, 48.8606)]),
      48.8606,
      2.3376,
    );
    expect(poi?.name).toBe('Louvre');
  });

  it('chooses the Point nearest the tap, not merely the first', () => {
    const poi = extractPoiFromFeatures(
      collection([point('Far Cafe', 2.4, 48.9), point('Near Cafe', 2.3377, 48.8607)]),
      48.8606,
      2.3376,
    );
    expect(poi?.name).toBe('Near Cafe');
  });

  it('skips unnamed Point features', () => {
    const unnamed: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [2.3376, 48.8606] },
    };
    expect(extractPoiFromFeatures(collection([unnamed]), 48.8606, 2.3376)).toBeNull();
  });

  it('prefers name_en when both are present', () => {
    const bilingual: GeoJSON.Feature = {
      type: 'Feature',
      properties: { name: 'Louvre', name_en: 'The Louvre' },
      geometry: { type: 'Point', coordinates: [2.3376, 48.8606] },
    };
    expect(extractPoiFromFeatures(collection([bilingual]), 48.8606, 2.3376)?.name).toBe('The Louvre');
  });

  it('returns null for an empty or missing collection', () => {
    expect(extractPoiFromFeatures(collection([]), 0, 0)).toBeNull();
    expect(extractPoiFromFeatures(undefined, 0, 0)).toBeNull();
  });

  it('accepts a MultiPoint feature and uses its first coordinate', () => {
    const poi = extractPoiFromFeatures(
      collection([multipoint('Train Station', [[2.3376, 48.8606], [2.4, 48.9]])]),
      48.8606,
      2.3376,
    );
    expect(poi?.name).toBe('Train Station');
    expect(poi?.lat).toBeCloseTo(48.8606);
    expect(poi?.lng).toBeCloseTo(2.3376);
  });

  it('rejects a MultiPolygon, even if named', () => {
    expect(extractPoiFromFeatures(collection([multipolygon('Island Group')]), 0, 0)).toBeNull();
  });

  it('picks the nearest Point even when lat and lng deltas pull in opposite directions', () => {
    // This fixture is designed to catch latitude/longitude transposition in distance math.
    // Skewed Lat is nearer in latitude but far in longitude; Skewed Lng is near in longitude
    // but far in latitude. The correct calculation (0.3² + 0.05² = 0.0925 vs 0.1² + 0.2² = 0.05)
    // picks Skewed Lng. If someone transposes the distance formula, the math flips
    // (0.55² + 0.2² = 0.3425 vs 0.7² + 0.4² = 0.65) and Skewed Lat wins instead — this test
    // catches that mistake. Never simplify this fixture; the skew is the whole point.
    const poi = extractPoiFromFeatures(
      collection([point('Skewed Lat', 45.55, 45.3), point('Skewed Lng', 45.7, 45.1)]),
      45.0,
      45.5,
    );
    expect(poi?.name).toBe('Skewed Lng');
  });
});

describe('makeCacheKey', () => {
  it('is stable for the same place', () => {
    expect(makeCacheKey('Louvre', 48.8606, 2.3376)).toBe(makeCacheKey('Louvre', 48.8606, 2.3376));
  });

  it('is case-insensitive on the name', () => {
    expect(makeCacheKey('LOUVRE', 48.8606, 2.3376)).toBe(makeCacheKey('louvre', 48.8606, 2.3376));
  });

  it('separates two different places', () => {
    expect(makeCacheKey('Louvre', 48.8606, 2.3376)).not.toBe(makeCacheKey('Louvre', 40.0, 2.3376));
  });
});
