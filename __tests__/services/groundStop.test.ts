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

  it('normalises an empty Google placeId to null rather than caching under ""', async () => {
    const result = await groundStop('X', CTX, {
      mapbox: jest.fn().mockResolvedValue(null),
      google: jest.fn().mockResolvedValue({
        placeId: '', name: 'X', address: null, lat: 1, lng: 2, countryCode: null,
      }),
    });
    expect(result?.placeId).toBeNull();
  });

  // A context with neither a box nor a centre has no geographic anchor at
  // all. Searching anyway is an unbiased planet-wide Google query — the exact
  // bug this module exists to prevent — so it must refuse instead.
  it('refuses a context with no bbox and no center, calling neither provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mapbox = jest.fn();
    const google = jest.fn();
    const result = await groundStop('Malecón', { bbox: null, center: null }, { mapbox, google });
    expect(result).toBeNull();
    expect(mapbox).not.toHaveBeenCalled();
    expect(google).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // The background pass's per-stop try/catch depends on this: a provider
  // outage (Google Text Search throws on any non-2xx) must reach the caller
  // so it skips the stop, NOT collapse into the null that persists a
  // permanent groundingFailedAt marker.
  it('propagates a rejection from the Google provider', async () => {
    await expect(
      groundStop('Bismarkcito', CTX, {
        mapbox: jest.fn().mockResolvedValue(null),
        google: jest.fn().mockRejectedValue(new Error('HTTP 429')),
      }),
    ).rejects.toThrow('HTTP 429');
  });

  it('propagates a rejection from the Mapbox provider', async () => {
    const google = jest.fn();
    await expect(
      groundStop('Malecón', CTX, {
        mapbox: jest.fn().mockRejectedValue(new Error('boom')),
        google,
      }),
    ).rejects.toThrow('boom');
    expect(google).not.toHaveBeenCalled();
  });
});
