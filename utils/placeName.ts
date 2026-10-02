/**
 * Google names Washington DC "Washington" and New York City "New York" — the
 * same as the states. Saved as a trip's destination, that name then reads as
 * the state everywhere it's used again: the AI prompt, the cover photo, the
 * region. A US city that shares its name with a state keeps its state code:
 * "Washington, DC", "New York, NY". The states themselves are left alone.
 */
const US_STATES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida',
  'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska',
  'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
  'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
]);

type Component = { longText?: string; shortText?: string; types?: string[] };

export function disambiguatePlaceName(name: string, components: Component[] | undefined, primaryType: string | undefined): string {
  if (!components || !US_STATES.has(name.trim().toLowerCase())) return name;
  if (components.find((c) => c.types?.includes('country'))?.shortText !== 'US') return name;
  const admin1 = components.find((c) => c.types?.includes('administrative_area_level_1'));
  if (!admin1?.shortText) return name;
  if (primaryType === 'administrative_area_level_1') return name; // the state itself
  // No type: only safe to tell a city from its state when the names differ (DC).
  if (!primaryType && admin1.longText?.trim().toLowerCase() === name.trim().toLowerCase()) return name;
  return `${name}, ${admin1.shortText}`;
}
