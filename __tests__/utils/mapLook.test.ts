import { basemapStyleUrl, basemapConfig, arrivalCamera } from '@/utils/mapLook';

describe('basemap', () => {
  it('the map style shows every 3D detail; satellite gets the options it has', () => {
    expect(basemapStyleUrl('map')).toBe('mapbox://styles/mapbox/standard');
    expect(basemapStyleUrl('satellite')).toBe('mapbox://styles/mapbox/standard-satellite');
    expect(basemapConfig('map', 'night', false)).toMatchObject({
      lightPreset: 'night', show3dBuildings: true, show3dLandmarks: true, show3dTrees: true, show3dFacades: true, showLandmarkIcons: true,
    });
    const sat = basemapConfig('satellite', 'night', false);
    expect(sat).toMatchObject({ lightPreset: 'night', showPlaceLabels: true, showPointOfInterestLabels: true });
    expect(sat).not.toHaveProperty('show3dLandmarks'); // not a satellite option
  });
  it('a flyover always plays in daylight, whatever the time', () => {
    expect(basemapConfig('map', 'night', true).lightPreset).toBe('day');
    expect(basemapConfig('satellite', 'dusk', true).lightPreset).toBe('day');
  });
});

describe('arrivalCamera', () => {
  it('comes in low over each stop, then circles it', () => {
    const c = arrivalCamera(0);
    expect(c.zoom).toBeGreaterThanOrEqual(16);
    expect(c.pitch).toBeGreaterThanOrEqual(60);
    expect(Math.abs(c.orbitTo - c.heading)).toBeGreaterThanOrEqual(25);
  });
  it('approaches each stop from a different side', () => {
    expect(arrivalCamera(1).heading).not.toBe(arrivalCamera(0).heading);
  });
});
