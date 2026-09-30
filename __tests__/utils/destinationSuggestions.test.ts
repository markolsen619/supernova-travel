import { isDestinationSuggestion } from '@/utils/destinationSuggestions';

describe('isDestinationSuggestion', () => {
  it('drops a street that shares a city name', () => {
    // "Cabo San Lucas" is also a street in La Paz — picking it saved La Paz's
    // coordinates as the Cabo leg of a trip.
    expect(isDestinationSuggestion(['route', 'geocode'])).toBe(false);
    expect(isDestinationSuggestion(['street_address', 'geocode'])).toBe(false);
    expect(isDestinationSuggestion(['premise'])).toBe(false);
    expect(isDestinationSuggestion(['postal_code', 'geocode'])).toBe(false);
  });

  it('keeps cities, regions, countries, parks and landmarks', () => {
    expect(isDestinationSuggestion(['locality', 'political', 'geocode'])).toBe(true);
    expect(isDestinationSuggestion(['administrative_area_level_1', 'political'])).toBe(true);
    expect(isDestinationSuggestion(['country', 'political'])).toBe(true);
    expect(isDestinationSuggestion(['national_park', 'park', 'establishment'])).toBe(true);
    expect(isDestinationSuggestion(['amusement_park', 'tourist_attraction', 'establishment'])).toBe(true);
    expect(isDestinationSuggestion(['natural_feature', 'establishment'])).toBe(true);
  });

  it('keeps a suggestion Google sent without types rather than hide it', () => {
    expect(isDestinationSuggestion(undefined)).toBe(true);
    expect(isDestinationSuggestion([])).toBe(true);
  });
});
