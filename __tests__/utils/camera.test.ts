import { pitchForZoom, headingForArrival } from '@/utils/camera';

describe('pitchForZoom', () => {
  it('is flat below zoom 8, where pitch would distort the globe', () => {
    expect(pitchForZoom(1.5)).toBe(0);
    expect(pitchForZoom(7.9)).toBe(0);
  });

  it('tilts moderately for city zooms', () => {
    expect(pitchForZoom(8)).toBe(45);
    expect(pitchForZoom(12.9)).toBe(45);
  });

  it('tilts hardest at POI zoom, where 3D buildings become visible', () => {
    expect(pitchForZoom(13)).toBe(55);
    expect(pitchForZoom(18)).toBe(55);
  });

  it('treats band edges as inclusive lower bounds', () => {
    // Guards the off-by-one: 8 and 13 belong to the HIGHER band.
    expect(pitchForZoom(8)).not.toBe(0);
    expect(pitchForZoom(13)).not.toBe(45);
  });

  it('never returns a pitch Mapbox would reject', () => {
    [0, 1, 5, 8, 10, 13, 16, 22].forEach((z) => {
      expect(pitchForZoom(z)).toBeGreaterThanOrEqual(0);
      expect(pitchForZoom(z)).toBeLessThanOrEqual(60);
    });
  });
});

describe('headingForArrival', () => {
  it('is deterministic — the same place always looks the same', () => {
    expect(headingForArrival(2.3522)).toBe(headingForArrival(2.3522));
  });

  it('varies between different places, so arrivals are not all identical', () => {
    expect(headingForArrival(2.3522)).not.toBe(headingForArrival(139.6917));
  });

  it('stays within a subtle range', () => {
    [-180, -74, 0, 2.35, 139.69, 180].forEach((lng) => {
      expect(Math.abs(headingForArrival(lng))).toBeLessThanOrEqual(25);
    });
  });
});
