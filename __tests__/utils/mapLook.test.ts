import { basemapConfig, arrivalCamera, SATELLITE_TILES } from '@/utils/mapLook';

describe('basemap', () => {
  it('one map style always, with every 3D detail — satellite is imagery laid under it, not another style', () => {
    expect(basemapConfig('night', false)).toMatchObject({
      lightPreset: 'night', show3dBuildings: true, show3dLandmarks: true, show3dTrees: true, show3dFacades: true, showLandmarkIcons: true,
    });
    expect(SATELLITE_TILES).toBe('mapbox://mapbox.satellite');
  });
  it('a flyover always plays in daylight, whatever the time', () => {
    expect(basemapConfig('night', true).lightPreset).toBe('day');
  });
});

describe('arrivalCamera', () => {
  it('comes in close over each stop (where it pauses, so tiles load), then circles it', () => {
    const c = arrivalCamera(0);
    expect(c.zoom).toBeGreaterThanOrEqual(15);
    expect(c.zoom).toBeLessThanOrEqual(16);
    expect(c.pitch).toBeGreaterThanOrEqual(55);
    expect(Math.abs(c.orbitTo - c.heading)).toBeGreaterThanOrEqual(25);
  });
  it('approaches each stop from a different side', () => {
    expect(arrivalCamera(1).heading).not.toBe(arrivalCamera(0).heading);
  });
});
