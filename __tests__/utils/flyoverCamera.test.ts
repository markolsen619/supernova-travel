import { aheadBearing, legPitch, limitTurn, legZoom } from '@/utils/flyoverCamera';

const line: [number, number][] = [[0, 0], [0, 1], [0.05, 1.05], [0, 1.1], [0, 2]]; // north, with a small kink

describe('aheadBearing', () => {
  it('faces where the route goes, not the kink under the camera', () => {
    const b = aheadBearing(line, 0.5, 0.3);
    expect(b < 20 || b > 340).toBe(true); // still heading north through the kink
  });
});

describe('limitTurn', () => {
  it('turns at most so far per step, the short way round', () => {
    expect(limitTurn(10, 100, 25)).toBe(35);
    expect(limitTurn(350, 20, 25)).toBe(15); // through north, not the long way
    expect(limitTurn(90, 100, 25)).toBe(100);
  });
});

describe('legZoom', () => {
  it('rises in the middle of a leg and comes down at both ends', () => {
    const start = legZoom('drive', 40_000, 0);
    const mid = legZoom('drive', 40_000, 0.5);
    const end = legZoom('drive', 40_000, 1);
    expect(mid).toBeLessThan(start - 1);
    expect(end).toBeCloseTo(start);
  });
  it('a short walk stays low', () => {
    expect(legZoom('walk', 600, 0.5)).toBeGreaterThan(14.5);
  });
});

describe('legPitch', () => {
  // At 58° and a pulled-back zoom a portrait screen showed half sky mid-drive.
  it('tilts at street level and flattens as the camera rises', () => {
    expect(legPitch(15)).toBe(58);
    expect(legPitch(14)).toBe(58);
    expect(legPitch(11)).toBe(45);
    expect(legPitch(9)).toBe(45);
    expect(legPitch(12.5)).toBeCloseTo(51.5);
  });
});
