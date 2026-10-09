// __tests__/utils/geoBounds.test.ts
import { boundsToBbox, bboxCenter, isBboxUsable, boundsHoldPoint, boxAround } from '@/utils/geoBounds';

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

describe('destination boxes must hold the destination', () => {
  const missionBeach = { lat: 32.7706, lng: -117.2514 };
  const missionTexas = { sw: [-98.444656, 26.102133] as [number, number], ne: [-98.257977, 26.391675] as [number, number] };
  const sanDiego = { sw: [-117.3, 32.53] as [number, number], ne: [-116.9, 33.11] as [number, number] };
  it('rejects a box found by name that is somewhere else entirely (Mission, Texas for Mission Beach)', () => {
    expect(boundsHoldPoint(missionTexas, missionBeach)).toBe(false);
    expect(boundsHoldPoint(sanDiego, missionBeach)).toBe(true);
  });
  it('allows a little slack at the edges', () => {
    expect(boundsHoldPoint(sanDiego, { lat: 32.52, lng: -117.31 })).toBe(true);
  });
  it('falls back to a box around the point, about 20 km each way', () => {
    const b = boxAround(missionBeach, 0.2);
    expect(b.sw[0]).toBeCloseTo(-117.4514);
    expect(b.ne[1]).toBeCloseTo(32.9706);
    expect(boundsHoldPoint(b, missionBeach)).toBe(true);
  });
});
