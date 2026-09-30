/**
 * Google place types that are an address, not somewhere to travel to.
 *
 * The destination picker searched everything, so a street that happens to
 * share a city's name ("Cabo San Lucas", a street in La Paz) could be picked
 * as the city — a trip's Cabo leg then stored La Paz's coordinates.
 */
const ADDRESS_TYPES = new Set([
  'route',
  'street_address',
  'street_number',
  'premise',
  'subpremise',
  'intersection',
  'plus_code',
  'postal_code',
  'postal_code_prefix',
]);

/**
 * Whether an autocomplete suggestion can be a trip destination. Filters out
 * addresses only: cities, regions, countries, parks, islands and landmarks all
 * stay, which is why this is a blocklist rather than Google's `(regions)`
 * filter — that one drops national parks and islands, both real destinations.
 */
export function isDestinationSuggestion(types: string[] | undefined): boolean {
  if (!types || types.length === 0) return true;
  return !types.some((t) => ADDRESS_TYPES.has(t));
}
