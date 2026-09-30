/**
 * The name for the area a multi-stop trip covers — "Baja California Sur" for
 * Loreto → La Paz → Cabo, "Central Europe" for Munich → Vienna → Prague — so a
 * trip card doesn't name only its first stop.
 *
 * Resolved once per trip from each destination's state and country (Mapbox,
 * see useTripCoverResolver) and stored as `Trip.regionName`. AI trips also ask
 * Gemini for it at generation time.
 */

export interface PlaceRegion {
  /** State, province or equivalent, when the geocoder has one. */
  region: string | null;
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: string;
  countryName: string;
}

type Continent = 'Europe' | 'Asia' | 'Africa' | 'North America' | 'South America' | 'Oceania';

/**
 * Travel regions as people plan trips around them — not a geopolitical
 * standard. Each country sits in exactly one, so "all in one region" is a
 * plain equality check; a country on a boundary (Turkey, Mexico) goes where
 * travelers most often pair it.
 */
const TRAVEL_REGIONS: Record<string, { continent: Continent; countries: string[] }> = {
  'Western Europe': { continent: 'Europe', countries: ['FR', 'BE', 'NL', 'LU', 'MC'] },
  'The British Isles': { continent: 'Europe', countries: ['GB', 'IE', 'IM', 'JE', 'GG'] },
  'Central Europe': { continent: 'Europe', countries: ['DE', 'AT', 'CH', 'LI', 'CZ', 'PL', 'HU', 'SK', 'SI'] },
  'Southern Europe': { continent: 'Europe', countries: ['IT', 'ES', 'PT', 'GR', 'MT', 'SM', 'VA', 'AD', 'CY', 'GI'] },
  'Scandinavia': { continent: 'Europe', countries: ['NO', 'SE', 'DK', 'FI', 'IS', 'FO'] },
  'The Balkans': { continent: 'Europe', countries: ['HR', 'BA', 'RS', 'ME', 'MK', 'AL', 'XK', 'BG'] },
  'The Baltics': { continent: 'Europe', countries: ['EE', 'LV', 'LT'] },
  'Eastern Europe': { continent: 'Europe', countries: ['RO', 'MD', 'UA', 'BY', 'RU'] },
  'Southeast Asia': { continent: 'Asia', countries: ['TH', 'VN', 'KH', 'LA', 'MY', 'SG', 'ID', 'PH', 'MM', 'BN', 'TL'] },
  'East Asia': { continent: 'Asia', countries: ['JP', 'KR', 'CN', 'TW', 'HK', 'MO', 'MN'] },
  'South Asia': { continent: 'Asia', countries: ['IN', 'NP', 'LK', 'BT', 'BD', 'MV', 'PK'] },
  'Central Asia': { continent: 'Asia', countries: ['KZ', 'UZ', 'KG', 'TJ', 'TM'] },
  'The Middle East': { continent: 'Asia', countries: ['AE', 'OM', 'QA', 'BH', 'KW', 'SA', 'JO', 'IL', 'PS', 'LB', 'TR', 'IR', 'IQ', 'SY', 'YE'] },
  'North Africa': { continent: 'Africa', countries: ['MA', 'DZ', 'TN', 'EG', 'LY'] },
  'East Africa': { continent: 'Africa', countries: ['KE', 'TZ', 'UG', 'RW', 'ET', 'BI', 'MG', 'SC', 'MU'] },
  'Southern Africa': { continent: 'Africa', countries: ['ZA', 'NA', 'BW', 'ZW', 'ZM', 'MZ', 'LS', 'SZ', 'MW'] },
  'West Africa': { continent: 'Africa', countries: ['GH', 'SN', 'NG', 'CI', 'CV', 'GM', 'ML', 'BF', 'TG', 'BJ', 'LR', 'SL', 'GN'] },
  'North America': { continent: 'North America', countries: ['US', 'CA', 'MX'] },
  'Central America': { continent: 'North America', countries: ['GT', 'BZ', 'SV', 'HN', 'NI', 'CR', 'PA'] },
  'The Caribbean': {
    continent: 'North America',
    countries: ['CU', 'JM', 'HT', 'DO', 'PR', 'BS', 'BB', 'TT', 'LC', 'AG', 'KN', 'VC', 'GD', 'DM', 'AW', 'CW', 'BQ', 'KY', 'TC', 'VG', 'VI', 'MQ', 'GP', 'BL', 'MF', 'SX', 'AI'],
  },
  'South America': { continent: 'South America', countries: ['AR', 'BR', 'CL', 'PE', 'BO', 'EC', 'CO', 'VE', 'UY', 'PY', 'GY', 'SR', 'GF'] },
  'Australia & New Zealand': { continent: 'Oceania', countries: ['AU', 'NZ'] },
  'The South Pacific': { continent: 'Oceania', countries: ['FJ', 'PF', 'WS', 'TO', 'VU', 'NC', 'CK', 'PG', 'SB', 'KI', 'PW', 'FM', 'MH'] },
};

const REGION_OF_COUNTRY = new Map<string, string>();
for (const [name, { countries }] of Object.entries(TRAVEL_REGIONS)) {
  for (const code of countries) REGION_OF_COUNTRY.set(code, name);
}

function allSame<T>(values: T[]): boolean {
  return values.every((v) => v === values[0]);
}

/**
 * The narrowest name that covers every place: their shared state, else their
 * shared country, else a shared travel region, else a shared continent.
 * Null with fewer than two known places, or across continents.
 */
export function regionNameFor(places: (PlaceRegion | null)[]): string | null {
  const known = places.filter((p): p is PlaceRegion => !!p);
  if (known.length < 2) return null;

  const countries = known.map((p) => p.countryCode);
  if (allSame(countries)) {
    const regions = known.map((p) => p.region);
    if (regions[0] && allSame(regions)) return regions[0];
    return known[0].countryName;
  }

  const travelRegions = countries.map((c) => REGION_OF_COUNTRY.get(c));
  if (travelRegions[0] && allSame(travelRegions)) return travelRegions[0];

  const continents = travelRegions.map((r) => (r ? TRAVEL_REGIONS[r].continent : undefined));
  if (continents[0] && allSame(continents)) return continents[0];

  return null;
}

interface MapboxRegionFeature {
  properties?: {
    feature_type?: string;
    name?: string;
    context?: {
      region?: { name?: string };
      country?: { name?: string; country_code?: string };
    };
  };
}

/** A Mapbox Search Box feature's state and country. */
export function regionFromMapboxFeature(f: MapboxRegionFeature | undefined | null): PlaceRegion | null {
  const p = f?.properties;
  if (!p) return null;

  if (p.feature_type === 'country') {
    const code = p.context?.country?.country_code;
    return p.name && code ? { region: null, countryCode: code.toUpperCase(), countryName: p.name } : null;
  }

  const country = p.context?.country;
  if (!country?.name || !country.country_code) return null;
  const region = p.feature_type === 'region' ? (p.name ?? null) : (p.context?.region?.name ?? null);
  return { region, countryCode: country.country_code.toUpperCase(), countryName: country.name };
}

/**
 * What a trip card calls a trip: its region for a multi-stop trip, the stops
 * themselves until that's known ("Loreto, La Paz & Cabo San Lucas"), and the
 * one destination otherwise. An empty regionName means "looked, found none".
 */
export function tripPlaceLabel(trip: {
  destination: { name: string };
  additionalDestinations: { name: string }[];
  regionName?: string | null;
}): string {
  const names = [trip.destination.name, ...trip.additionalDestinations.map((d) => d.name)].filter(Boolean);
  if (names.length <= 1) return trip.destination.name;
  if (trip.regionName) return trip.regionName;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`;
  return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
}
