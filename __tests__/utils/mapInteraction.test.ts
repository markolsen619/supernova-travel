import {
  tapBbox,
  shouldFallbackToNearby,
  nearbyRadiusForZoom,
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
