import { project, arcPath, arcPaths, shortLngDelta, worldDots, dotsPath } from '@/utils/yearMap';
describe('yearMap', () => {
  it('the bundled world has land dots', () => {
    const w = worldDots();
    expect(w.length).toBeGreaterThan(1200);
    expect(w.length).toBeLessThan(3000);
    // Somewhere in central Europe and the Sahara are land; mid-Pacific is not.
    const has = (lat: number, lng: number) => w.some(([a, b]) => Math.abs(a - lat) <= 1.25 && Math.abs(b - lng) <= 1.25);
    expect(has(50, 10)).toBe(true);
    expect(has(22.5, 10)).toBe(true);
    expect(has(0, -150)).toBe(false);
  });
  it('projects corners and the centre', () => {
    expect(project(85, -180, 360, 145)).toEqual({ x: 0, y: 0 });
    expect(project(-60, 180, 360, 145)).toEqual({ x: 360, y: 145 });
  });
  it('the short way across the antimeridian', () => {
    expect(shortLngDelta(139.7, -118.2)).toBeCloseTo(102.1, 1); // Tokyo → LA goes east across 180
    expect(shortLngDelta(-9.1, 139.7)).toBeCloseTo(148.8, 1);
  });
  it('arc path is an SVG quadratic curve', () => {
    expect(arcPath({ lat: 38.7, lng: -9.1 }, { lat: 41.9, lng: 12.5 }, 360, 145)).toMatch(/^M[\d.]+ [\d.]+ Q[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/);
  });
});

describe('arcPaths (review fix: an arc crossing the date line wraps onto the other edge)', () => {
  const W = 360, H = 145;
  const endX = (d: string) => Number(d.trim().split(/\s+/).slice(-2)[0]);
  it('Lisbon → Rome is one arc', () => {
    expect(arcPaths({ lat: 38.7, lng: -9.1 }, { lat: 41.9, lng: 12.5 }, W, H)).toHaveLength(1);
  });
  it('Tokyo → Los Angeles is drawn twice so it leaves the right edge and arrives at LA from the left', () => {
    const paths = arcPaths({ lat: 35.7, lng: 139.7 }, { lat: 34.05, lng: -118.2 }, W, H);
    expect(paths).toHaveLength(2);
    const la = project(34.05, -118.2, W, H).x;
    expect(paths.some((d) => Math.abs(endX(d) - la) < 0.5)).toBe(true);
  });
});

describe('dotsPath (review fix: the map as one shape, not 2,400 views)', () => {
  it('one move per land dot', () => {
    const d = dotsPath(360, 145);
    expect((d.match(/M/g) ?? []).length).toBe(worldDots().length);
  });
});
