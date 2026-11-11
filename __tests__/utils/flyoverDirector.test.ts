import { angleDelta, glideSegments, metersPerPoint, samplePath, segmentAt, smoothLine, SCREEN_SPEED_PTS } from '@/utils/flyoverDirector';
import { haversineMeters } from '@/utils/tripRoutes';

// A zig-zag walk through a city grid at Mexico City's latitude.
const zig: [number, number][] = [[-99.133, 19.432], [-99.128, 19.432], [-99.128, 19.428], [-99.122, 19.428], [-99.122, 19.424], [-99.116, 19.424]];
const zigMeters = zig.slice(1).reduce((a, c, i) => a + haversineMeters({ lat: zig[i][1], lng: zig[i][0] }, { lat: c[1], lng: c[0] }), 0);

describe('geometry', () => {
  it('samples a path every ~50 m with fractions 0..1', () => {
    const s = samplePath(zig);
    expect(s[0].f).toBe(0);
    expect(s[s.length - 1].f).toBeCloseTo(1);
    expect(s.length).toBeGreaterThan(40);
  });
  it('smoothing keeps the ends and the sample count', () => {
    const s = samplePath(zig);
    const m = smoothLine(s, 600);
    expect(m[0].lng).toBeCloseTo(s[0].lng, 6);
    expect(m.length).toBe(s.length);
  });
  it('angleDelta takes the short way round', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });
});

describe('glideSegments — comfort limits', () => {
  const segs = glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0, to: 1, slowIn: false, startBearing: 90 });
  it('covers the span exactly, in order, with no zero-length segment', () => {
    expect(segs[0].from).toBe(0);
    expect(segs[segs.length - 1].to).toBe(1);
    segs.forEach((g, i) => { expect(g.to).toBeGreaterThan(g.from); if (i) expect(g.from).toBe(segs[i - 1].to); });
  });
  it('every segment lasts 2–4 s (×1.8 at most when slowing in)', () => {
    segs.forEach((g) => { expect(g.ms).toBeGreaterThanOrEqual(2000); expect(g.ms).toBeLessThanOrEqual(4000); });
  });
  it('turns at most 12° a second', () => {
    let prev = 90;
    segs.forEach((g) => { expect(Math.abs(angleDelta(prev, g.camera.bearing))).toBeLessThanOrEqual(12 * (g.ms / 1000) + 1e-6); prev = g.camera.bearing; });
  });
  it('never moves faster than the screen-speed cap', () => {
    segs.forEach((g) => {
      const meters = (g.to - g.from) * zigMeters;
      const ptsPerSec = meters / metersPerPoint(19.43, g.camera.zoom) / (g.ms / 1000);
      expect(ptsPerSec).toBeLessThanOrEqual(SCREEN_SPEED_PTS * 1.01);
    });
  });
  it('slows into a feature (last two segments longer)', () => {
    const s = glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0, to: 1, slowIn: true, startBearing: 90 });
    const n = s.length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(s[n - 1].ms).toBeGreaterThan(s[n - 3].ms);
    expect(s[n - 2].ms).toBeGreaterThan(s[n - 3].ms);
  });
  it('a zero-length span (two stops at one spot) gives no segments (review focus 4)', () => {
    expect(glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0.4, to: 0.4, slowIn: true, startBearing: 0 })).toEqual([]);
  });
});

describe('segmentAt (review focus 3: resume mid-glide)', () => {
  const segs = [{ from: 0, to: 0.3 }, { from: 0.3, to: 0.7 }, { from: 0.7, to: 1 }];
  it('finds the segment under the head', () => {
    expect(segmentAt(segs, 0)).toBe(0);
    expect(segmentAt(segs, 0.5)).toBe(1);
    expect(segmentAt(segs, 0.7)).toBe(2);
    expect(segmentAt(segs, 1)).toBe(2);
  });
});
