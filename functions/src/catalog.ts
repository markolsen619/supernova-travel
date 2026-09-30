/** The editorial destination catalog — data/destinations.json is the source of truth. */
export type ContinentChip = 'europe' | 'asia' | 'americas' | 'africa-middle-east' | 'oceania';
export type Vibe = 'beaches' | 'food' | 'adventure' | 'culture' | 'nature' | 'nightlife';

export interface CatalogEntry {
  slug: string;
  name: string;
  countryCode: string;
  countryName: string;
  continentChip: ContinentChip;
  vibes: Vibe[];
  /** 1–100: weight in the world heat-map baseline and Explore's default order. */
  popularity: number;
  /** What Mapbox geocodes for the centre and box, e.g. "Lisbon, Portugal". */
  query: string;
  /** Travel styles of its 2–3 editorial itineraries (GenerateTripRequest travelStyle values). */
  styles: string[];
}

const CHIPS = new Set(['europe', 'asia', 'americas', 'africa-middle-east', 'oceania']);
const VIBES = new Set(['beaches', 'food', 'adventure', 'culture', 'nature', 'nightlife']);
const STYLES = new Set(['adventure', 'luxury', 'budget', 'family', 'cultural']);

export function validateCatalog(entries: CatalogEntry[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.slug)) problems.push(`duplicate slug: ${e.slug}`);
    seen.add(e.slug);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) problems.push(`${e.slug}: slug must be lowercase-hyphenated`);
    if (!/^[A-Z]{2}$/.test(e.countryCode)) problems.push(`${e.slug}: countryCode must be ISO alpha-2`);
    if (!CHIPS.has(e.continentChip)) problems.push(`${e.slug}: continentChip`);
    if (!Array.isArray(e.vibes) || e.vibes.length === 0 || e.vibes.some((v) => !VIBES.has(v))) problems.push(`${e.slug}: vibes`);
    if (!(e.popularity >= 1 && e.popularity <= 100)) problems.push(`${e.slug}: popularity must be 1–100`);
    if (!e.name?.trim() || !e.query?.trim() || !e.countryName?.trim()) problems.push(`${e.slug}: name/query/countryName required`);
    if (!Array.isArray(e.styles) || e.styles.length < 2 || e.styles.length > 3 || e.styles.some((s) => !STYLES.has(s))) {
      problems.push(`${e.slug}: styles must be 2–3 of ${[...STYLES].join(', ')}`);
    }
  }
  return problems;
}
