import {
  findStopMatchingPlace,
  metersBetween,
  tapBbox,
  shouldFallbackToNearby,
  nearbyRadiusForZoom,
  nearbyCacheKey,
  TAP_RADIUS_PT,
} from '@/utils/mapInteraction';

describe('tapBbox', () => {
  // rnmapbox takes [top, left, bottom, right] — NOT the [minX, minY, maxX,
  // maxY] most bbox APIs use. Inverting it returns an empty collection with
  // no error, which looks exactly like "no POI here".
  it('emits [top, left, bottom, right] in that order', () => {
    const [top, left, bottom, right] = tapBbox(100, 200, 10);
    expect(top).toBe(190);
    expect(left).toBe(90);
    expect(bottom).toBe(210);
    expect(right).toBe(110);
  });

  it('defaults to half the 44pt touch target', () => {
    expect(TAP_RADIUS_PT).toBe(22);
    const [top, , bottom] = tapBbox(100, 200);
    expect(bottom - top).toBe(44);
  });

  it('never emits negative coordinates near a screen edge', () => {
    const [top, left] = tapBbox(5, 5, 22);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left).toBeGreaterThanOrEqual(0);
  });
});

describe('shouldFallbackToNearby', () => {
  it('is false at globe zoom, where a tap spans hundreds of kilometres', () => {
    expect(shouldFallbackToNearby(1.5)).toBe(false);
    expect(shouldFallbackToNearby(12)).toBe(false);
  });

  it('is true once zoomed in enough for a nearby lookup to mean something', () => {
    expect(shouldFallbackToNearby(12.1)).toBe(true);
    expect(shouldFallbackToNearby(18)).toBe(true);
  });
});

describe('nearbyRadiusForZoom', () => {
  it('tightens as the user zooms in', () => {
    expect(nearbyRadiusForZoom(13)).toBeGreaterThan(nearbyRadiusForZoom(16));
  });

  it('stays within the bounds Google accepts', () => {
    [13, 14, 15, 16, 17, 18, 20].forEach((z) => {
      expect(nearbyRadiusForZoom(z)).toBeGreaterThanOrEqual(50);
      expect(nearbyRadiusForZoom(z)).toBeLessThanOrEqual(50000);
    });
  });
});

describe('nearbyCacheKey', () => {
  it('is deterministic for the same coordinates', () => {
    expect(nearbyCacheKey(40.7128, -74.006)).toBe(nearbyCacheKey(40.7128, -74.006));
  });

  it('collides taps within ~11m (4 decimal places) of each other', () => {
    // Same key once both are rounded to 4dp — this is the "free re-tap" case.
    expect(nearbyCacheKey(40.71281, -74.00601)).toBe(nearbyCacheKey(40.71284, -74.00604));
  });

  it('does not collide taps meaningfully far apart', () => {
    expect(nearbyCacheKey(40.7128, -74.006)).not.toBe(nearbyCacheKey(40.7228, -74.006));
  });

  it('rounds to exactly 4 decimal places', () => {
    expect(nearbyCacheKey(1.23456789, -2.3456789)).toBe('1.2346,-2.3457');
  });

  it('distinguishes lat from lng so a transposed tap does not collide', () => {
    expect(nearbyCacheKey(10, 20)).not.toBe(nearbyCacheKey(20, 10));
  });
});

describe('metersBetween', () => {
  it('is zero for the same point', () => {
    expect(metersBetween(24.1426, -110.3128, 24.1426, -110.3128)).toBe(0);
  });

  it('measures a short offset in metres', () => {
    // ~0.0001 deg latitude is ~11.1 m.
    expect(metersBetween(24.1426, -110.3128, 24.1427, -110.3128)).toBeCloseTo(11.1, 0);
  });
});

describe('findStopMatchingPlace', () => {
  const withId = { placeId: 'g1', lat: 24.1426, lng: -110.3128 };
  const mapboxGrounded = { placeId: null, lat: 24.1426, lng: -110.3128 };

  it('matches on placeId when both sides carry one', () => {
    const far = { placeId: 'g1', lat: 48.8606, lng: 2.3376 };
    expect(findStopMatchingPlace([far], { placeId: 'g1', lat: 24.1426, lng: -110.3128 })).toBe(far);
  });

  it('matches a Mapbox-grounded stop (no placeId) by proximity', () => {
    // The majority case: ~10 m apart, resolved place has a Google id, stop does not.
    const match = findStopMatchingPlace([mapboxGrounded], {
      placeId: 'g9',
      lat: 24.14261,
      lng: -110.31281,
    });
    expect(match).toBe(mapboxGrounded);
  });

  it('does not match a Mapbox-grounded stop a block away', () => {
    expect(
      findStopMatchingPlace([mapboxGrounded], { placeId: 'g9', lat: 24.145, lng: -110.3128 }),
    ).toBeUndefined();
  });

  it('does not collapse two separately-identified Google places that sit metres apart', () => {
    expect(
      findStopMatchingPlace([withId], { placeId: 'g2', lat: 24.14261, lng: -110.31281 }),
    ).toBeUndefined();
  });

  it('picks the nearest candidate when several are in range', () => {
    const near = { placeId: null, lat: 24.14261, lng: -110.3128 };
    const nearer = { placeId: null, lat: 24.142605, lng: -110.3128 };
    expect(findStopMatchingPlace([near, nearer], { placeId: null, lat: 24.1426, lng: -110.3128 })).toBe(nearer);
  });

  it('returns undefined for an empty stop list', () => {
    expect(findStopMatchingPlace([], { placeId: 'g1', lat: 0, lng: 0 })).toBeUndefined();
  });
});
