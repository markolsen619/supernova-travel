import { groundStop } from '@/services/places/groundStop';
import type { GroundedPlace } from '@/utils/mapboxQuery';

const CTX = { bbox: [-110.42, 24.05, -110.24, 24.22] as [number, number, number, number],
              center: { lat: 24.1426, lng: -110.3128 } };

const mapboxHit: GroundedPlace = {
  name: 'Malecón de La Paz', lat: 24.14, lng: -110.31, address: null,
  countryCode: 'MX', source: 'mapbox', placeId: null, mapboxId: 'm1',
};

describe('groundStop', () => {
  it('returns the Mapbox result without calling Google', async () => {
    const google = jest.fn();
    const result = await groundStop('Malecón de La Paz', CTX, {
      mapbox: jest.fn().mockResolvedValue(mapboxHit),
      google,
    });
    expect(result).toEqual(mapboxHit);
    expect(google).not.toHaveBeenCalled();
  });

  it('falls back to Google when Mapbox misses, biased to the centre', async () => {
    const google = jest.fn().mockResolvedValue({
      placeId: 'g1', name: 'Bismarkcito', address: 'La Paz', lat: 24.15, lng: -110.32, countryCode: 'MX',
    });
    const result = await groundStop('Restaurante Bismarkcito', CTX, {
      mapbox: jest.fn().mockResolvedValue(null),
      google,
    });
    expect(google).toHaveBeenCalledWith('Restaurante Bismarkcito', CTX.center);
    expect(result).toMatchObject({ source: 'google', placeId: 'g1', lat: 24.15 });
  });

  it('returns null when both providers miss', async () => {
    const result = await groundStop('Nowhere At All', CTX, {
      mapbox: jest.fn().mockResolvedValue(null),
      google: jest.fn().mockResolvedValue(null),
    });
    expect(result).toBeNull();
  });

  it('skips Mapbox and goes straight to Google when there is no usable bbox', async () => {
    const mapbox = jest.fn();
    const google = jest.fn().mockResolvedValue({
      placeId: 'g2', name: 'X', address: null, lat: 1, lng: 2, countryCode: null,
    });
    await groundStop('X', { bbox: null, center: CTX.center }, { mapbox, google });
    expect(mapbox).not.toHaveBeenCalled();
    expect(google).toHaveBeenCalled();
  });
});
