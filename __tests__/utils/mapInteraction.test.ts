import {
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
