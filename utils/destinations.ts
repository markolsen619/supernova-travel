import type { ActivityType, Trip } from '@/types';
import type { EnrichedPlace } from '@/stores/usePlacesStore';

/**
 * The editorial destination catalog as the app reads it: `destinations/{slug}`
 * (seeded by scripts/seed-destinations.mjs, aggregated daily by
 * aggregateDiscovery). Pure — the hooks fetch, these decide.
 */
export type RegionChip = 'all' | 'europe' | 'asia' | 'americas' | 'africa-middle-east' | 'oceania';
export type VibeChip = 'all' | 'beaches' | 'food' | 'adventure' | 'culture' | 'nature' | 'nightlife';

export const REGION_CHIPS: { id: RegionChip; label: string }[] = [
  { id: 'all', label: 'Everywhere' },
  { id: 'europe', label: 'Europe' },
  { id: 'asia', label: 'Asia' },
  { id: 'americas', label: 'Americas' },
  { id: 'africa-middle-east', label: 'Africa & Middle East' },
  { id: 'oceania', label: 'Oceania' },
];

export const VIBE_CHIPS: { id: VibeChip; label: string }[] = [
  { id: 'all', label: 'Any vibe' },
  { id: 'beaches', label: 'Beaches' },
  { id: 'food', label: 'Food' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'culture', label: 'Culture' },
  { id: 'nature', label: 'Nature' },
  { id: 'nightlife', label: 'Nightlife' },
];

export interface TopPlace {
  name: string;
  type: ActivityType;
  lat: number;
  lng: number;
  placeId: string | null;
  itineraryCount: number;
}

export interface Destination {
  slug: string;
  name: string;
  countryCode: string;
  countryName: string;
  continentChip: Exclude<RegionChip, 'all'>;
  vibes: string[];
  popularity: number;
  center: { lat: number; lng: number };
  coverImageUrl: string | null;
  placeId: string | null;
  topPlaces: TopPlace[];
  /** Public itineraries here, editorial + community. */
  itineraryCount: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
// The aggregation only ranks these (functions/src/discovery.ts PLACE_TYPES); checked again so a stray row can't render as a hotel.
const PLACE_TYPES: ActivityType[] = ['activity', 'restaurant'];

function parseTopPlace(v: unknown): TopPlace | null {
  const p = v as Record<string, unknown> | null;
  const name = str(p?.name);
  const lat = num(p?.lat), lng = num(p?.lng);
  const type = p?.type as ActivityType;
  if (!name || lat == null || lng == null || !PLACE_TYPES.includes(type)) return null;
  return { name, type, lat, lng, placeId: str(p?.placeId), itineraryCount: num(p?.itineraryCount) ?? 0 };
}

export function parseDestination(id: string, data: Record<string, unknown>): Destination | null {
  const name = str(data.name);
  const c = data.center as Record<string, unknown> | undefined;
  const lat = num(c?.lat), lng = num(c?.lng);
  if (!name || lat == null || lng == null) return null;
  return {
    slug: id,
    name,
    countryCode: str(data.countryCode) ?? '',
    countryName: str(data.countryName) ?? '',
    continentChip: (str(data.continentChip) ?? 'europe') as Destination['continentChip'],
    vibes: Array.isArray(data.vibes) ? data.vibes.filter((v): v is string => typeof v === 'string') : [],
    popularity: num(data.popularity) ?? 0,
    center: { lat, lng },
    coverImageUrl: str(data.coverImageUrl),
    placeId: str(data.placeId),
    topPlaces: Array.isArray(data.topPlaces) ? data.topPlaces.map(parseTopPlace).filter((p): p is TopPlace => !!p) : [],
    itineraryCount: num(data.itineraryCount) ?? 0,
  };
}

export function filterDestinations(list: Destination[], region: RegionChip, vibe: VibeChip): Destination[] {
  return list
    .filter((d) => (region === 'all' || d.continentChip === region) && (vibe === 'all' || d.vibes.includes(vibe)))
    .sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
}

export function findDestination(list: Destination[], slug: string): Destination | null {
  return list.find((d) => d.slug === slug) ?? null;
}

/** `PORTUGAL · 4 TRIPS` — the editorial eyebrow on cards and the destination page. */
export function destinationEyebrow(d: Destination): string {
  const country = d.countryName.toUpperCase();
  if (d.itineraryCount <= 0) return country;
  return `${country} · ${d.itineraryCount} ${d.itineraryCount === 1 ? 'TRIP' : 'TRIPS'}`;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Catalog destinations whose name or country has a word starting with the query. */
export function matchDestinations(list: Destination[], query: string, limit = 3): Destination[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const hit = (s: string) => fold(s).split(/[\s,-]+/).some((w) => w.startsWith(q)) || fold(s).startsWith(q);
  return list
    .filter((d) => hit(d.name) || hit(d.countryName))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

/** Supernova picks first, then travelers' trips; input order (by saves) kept; each trip once. */
export function splitDestinationTrips(trips: Trip[]): { editorial: Trip[]; community: Trip[] } {
  const seen = new Set<string>();
  const editorial: Trip[] = [];
  const community: Trip[] = [];
  for (const t of trips) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    (t.isEditorial === true ? editorial : community).push(t);
  }
  return { editorial, community };
}

/**
 * A tier1 seed for PlaceDetailSheet, which upgrades it on open (through the
 * shared places cache). '' = Mapbox-grounded, nothing to upgrade — the same
 * convention as utils/activityPlace.
 */
export function topPlaceToPlace(p: TopPlace): EnrichedPlace {
  return { placeId: p.placeId ?? '', name: p.name, address: '', lat: p.lat, lng: p.lng, countryCode: null, tier: 'tier1' };
}

export function placeShare(p: TopPlace, itineraryCount: number): string {
  if (itineraryCount <= 1) return 'In 1 itinerary';
  return `In ${p.itineraryCount} of ${itineraryCount} itineraries`;
}
