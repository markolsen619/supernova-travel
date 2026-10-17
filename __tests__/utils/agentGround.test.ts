jest.mock('@/services/places/mapboxSearch', () => ({ searchPlaceInBounds: jest.fn() }));
jest.mock('@/services/places/googlePlaces', () => ({ enrichPlaceByQuery: jest.fn() }));
import { acceptNovaPlace, groundNovaPlace } from '@/utils/agentGround';
import { groundingContextFor } from '@/utils/groundingContext';

const center = { lat: 32.7706, lng: -117.2514 }; // Mission Beach
const place = (name: string, lat: number, lng: number) =>
  ({ name, lat, lng, address: '1 Main St', countryCode: 'US', source: 'mapbox' as const, placeId: null, mapboxId: 'x', isVenue: true });
const dest = { name: 'Mission Beach', placeId: null, lat: center.lat, lng: center.lng, countryCode: 'US', bounds: { sw: [-117.3, 32.7], ne: [-117.1, 32.9] } } as never;

describe('acceptNovaPlace', () => {
  it('accepts a matching venue inside the area', () => {
    expect(acceptNovaPlace('Pennant, Mission Beach', place('Pennant', 32.7712, -117.2522), center).status).toBe('found');
  });
  it('rejects a namesake far away (the Pennant case)', () => {
    expect(acceptNovaPlace('Pennant, Mission Beach', place('Pennant Bar', 33.12, -117.08), center).status).toBe('notFound');
  });
  it('rejects a nearby place with a different name', () => {
    expect(acceptNovaPlace('Pennant, Mission Beach', place('Belmont Park', 32.771, -117.252), center).status).toBe('notFound');
  });
  it('rejects null', () => {
    expect(acceptNovaPlace('Pennant', null, center).status).toBe('notFound');
  });
  it('without a centre, accepts on the name alone', () => {
    expect(acceptNovaPlace('Pennant', place('Pennant', 1, 1), null).status).toBe('found');
  });
});

describe('groundNovaPlace', () => {
  it('google answer 40 km away is rejected even though Mapbox missed', async () => {
    const providers = {
      mapbox: jest.fn().mockResolvedValue(null),
      google: jest.fn().mockResolvedValue({ placeId: 'g1', name: 'Pennant', address: 'x', lat: 33.13, lng: -117.07, countryCode: 'US', types: ['bar', 'establishment'] }),
    };
    expect((await groundNovaPlace('Pennant, Mission Beach', dest, providers)).status).toBe('notFound');
  });
  it('uses the day city box', async () => {
    const providers = { mapbox: jest.fn().mockResolvedValue(place('Pennant', 32.7712, -117.2522)), google: jest.fn() };
    const r = await groundNovaPlace('Pennant, Mission Beach', dest, providers);
    expect(r.status).toBe('found');
    expect(providers.mapbox.mock.calls[0][1]).toEqual(groundingContextFor(dest).bbox);
  });
});
