// __tests__/utils/geoBounds.test.ts
import { boundsToBbox, bboxCenter, isBboxUsable } from '@/utils/geoBounds';

const LA_PAZ = { sw: [-110.42, 24.05] as [number, number], ne: [-110.24, 24.22] as [number, number] };

describe('boundsToBbox', () => {
  it('emits west,south,east,north from [lng,lat] corners', () => {
    expect(boundsToBbox(LA_PAZ)).toEqual([-110.42, 24.05, -110.24, 24.22]);
  });

  it('returns null for missing bounds', () => {
    expect(boundsToBbox(null)).toBeNull();
  });

  it('returns null when a corner is malformed', () => {
    expect(boundsToBbox({ sw: [-110.42, 24.05], ne: [NaN, 24.22] } as never)).toBeNull();
  });
});

describe('bboxCenter', () => {
  it('returns the midpoint as lat/lng', () => {
    const c = bboxCenter([-110.42, 24.05, -110.24, 24.22]);
    expect(c.lng).toBeCloseTo(-110.33, 10);
    expect(c.lat).toBeCloseTo(24.135, 10);
  });
});

describe('isBboxUsable', () => {
  it('accepts a city-sized box', () => {
    expect(isBboxUsable([-110.42, 24.05, -110.24, 24.22])).toBe(true);
  });

  it('rejects a degenerate zero-area box', () => {
    expect(isBboxUsable([-110.3, 24.1, -110.3, 24.1])).toBe(false);
  });

  it('rejects an antimeridian-crossing box rather than silently inverting it', () => {
    expect(isBboxUsable([179.5, 24.0, -179.5, 24.5])).toBe(false);
  });
});
