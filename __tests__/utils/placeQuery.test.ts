import { buildTextSearchBody } from '@/utils/placeQuery';
import { GROUNDING_LIST_FIELD_MASK } from '@/services/places/googlePlaces';

describe('buildTextSearchBody', () => {
  it('omits locationBias entirely when no bias is given', () => {
    const body = buildTextSearchBody('Playa El Tecolote');
    expect(body).toEqual({ textQuery: 'Playa El Tecolote', maxResultCount: 1, languageCode: 'en' });
    expect('locationBias' in body).toBe(false);
  });

  it('adds a circular locationBias when a bias is given', () => {
    const body = buildTextSearchBody('Playa El Tecolote', { lat: 24.1426, lng: -110.3128 });
    expect(body.locationBias).toEqual({
      circle: { center: { latitude: 24.1426, longitude: -110.3128 }, radius: 50000 },
    });
  });

  it('honours an explicit radius', () => {
    const body = buildTextSearchBody('Malecón', { lat: 24.1426, lng: -110.3128, radiusM: 100 });
    expect((body.locationBias as any).circle.radius).toBe(100);
  });

  it('clamps radius to the Google maximum of 50000m', () => {
    const body = buildTextSearchBody('Malecón', { lat: 24.1426, lng: -110.3128, radiusM: 999999 });
    expect((body.locationBias as any).circle.radius).toBe(50000);
  });
});

// The field mask is the actual cost lever on the grounding path: adding any
// Atmosphere field (rating, priceLevel, regularOpeningHours, editorialSummary)
// silently moves every grounding call from Text Search Pro ($32/1k, 5,000 free)
// to the Atmosphere SKU, with nothing else in the codebase failing. Pinned
// exactly, not by substring — a change here must be a deliberate one.
describe('GROUNDING_LIST_FIELD_MASK', () => {
  it('requests identity and position only', () => {
    expect(GROUNDING_LIST_FIELD_MASK).toBe(
      'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents',
    );
  });

  it('requests no Atmosphere-SKU field', () => {
    for (const field of ['rating', 'userRatingCount', 'priceLevel', 'regularOpeningHours', 'photos', 'editorialSummary']) {
      expect(GROUNDING_LIST_FIELD_MASK).not.toContain(field);
    }
  });
});
