# Explore, destination pages, globe heat map, and flyover stop pauses — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the seeded discovery data (30 destinations, 69 editorial trips, `aggregates/heatmap`) into the Explore grid with region/vibe chips, a page per destination and a heat map on the Search globe; and make the trip-map flyover pause at each stop for a couple of seconds to show it, before the next TestFlight build and the 1.0.1 submission.

**Architecture:** Every rule is a pure function in `utils/` with Jest tests (this repo has no component renderer): `utils/destinations.ts` (parse, filter, order, label), `utils/heatmap.ts` (flattened points → GeoJSON, pin features, tap hit-test), and an extended `utils/flyover.ts` reducer that clamps the drawing head to each stop and dwells there. Hooks read Firestore once with long `staleTime`s; screens are thin. No new paid API calls: photos come from stored `coverImageUrl`s, place details only when a sheet opens (through the existing shared cache).

**Tech Stack:** Expo SDK 54, Expo Router v6, TanStack Query, Firestore web SDK, @rnmapbox/maps 10.3.2 (`HeatmapLayer`, `CircleLayer`, `SymbolLayer`, `MarkerView`), phosphor-react-native, Jest.

**Spec:** `docs/superpowers/specs/2026-09-30-discovery-and-trip-map-design.md` (Part 3; the flyover stop pause extends Part 1's Flyover section at the user's request on 2026-09-30: "stop for a couple seconds and show the user the stop, and then move on to the next stop").

## Global Constraints

- Light editorial chrome (`#FBF9F5` canvas) on Explore and the destination page; the Search globe and trip map stay dark (always-dark screens, `DarkColors` allowed there only).
- No emoji (country flags via `countryCodeToEmoji` are the one sanctioned exception, and this plan doesn't add any).
- One primary action per screen. On the destination page it is **Plan my trip here**.
- Every empty state: icon + title + description + action.
- House spring `tension: 65, friction: 11`. Haptics: `Light` on select/nav, `Medium` on create.
- Touch targets ≥ 44pt; icon-only buttons have `accessibilityLabel`.
- Colors via `useTheme()`; nothing theme-dependent inside `StyleSheet.create`.
- Lists are `FlashList` where they scroll on their own; grids inside an outer `ScrollView` stay plain `View`s (same as today's Explore).
- `@/` imports; `useCallback` for handlers passed as props.
- Every surface showing other people's trips filters them with `useModeration()` + `filterVisible`.
- No new Google Places calls on render. `PlaceDetailSheet` upgrades a tier1 place on open through `enrichPlaceById`, which reads the shared `places/{placeId}` cache first.
- The heat map is read once (`staleTime` 12 h). Catalog: one `getDocs` of `destinations` (≈ 30 reads, `staleTime` 12 h).
- Mapbox Standard custom circle layers need `circleEmissiveStrength: 1` (night presets turn them black otherwise).
- Flyover: Reduce Motion still skips it entirely.

## Review Focus

1. **A filter combination with no destinations** (e.g. Oceania + Nightlife): the grid is replaced by the empty state with a *Clear filters* action, not a blank gap. → `filterDestinations` test for an empty result (Task 1) and the empty-state branch (Task 3).
2. **A malformed or empty heat map document** (`points` missing, length not a multiple of 3, a non-finite value, a latitude outside ±90): no layer is drawn, the globe still works. → `heatFeatures` tests (Task 1).
3. **Two consecutive stops at the same spot** (fraction equal), and **a day whose path is empty**: the flyover pauses at each stop separately, and skips an empty day without dwelling. → reducer tests (Task 5).
4. **A destination opened by deep link before Explore has loaded** (cold cache), or a slug not in the catalog: the page loads the catalog itself; an unknown slug shows an empty state with *Back to Explore*. → `findDestination` test (Task 1) and the not-found branch (Task 4).
5. **A trip in both lists**: an editorial trip must not also appear under "From travelers". → `splitDestinationTrips` test (Task 1).

---

### Task 1: Pure discovery rules (`utils/destinations.ts`, `utils/heatmap.ts`)

**Files:**
- Create: `utils/destinations.ts`, `utils/heatmap.ts`
- Modify: `types/index.ts` (add `isEditorial?: boolean; destinationKeys?: string[];` to `Trip`)
- Test: `__tests__/utils/destinations.test.ts`, `__tests__/utils/heatmap.test.ts`

**Interfaces:**
- Produces:
  - `type RegionChip = 'all' | 'europe' | 'asia' | 'americas' | 'africa-middle-east' | 'oceania'`
  - `type VibeChip = 'all' | 'beaches' | 'food' | 'adventure' | 'culture' | 'nature' | 'nightlife'`
  - `REGION_CHIPS: { id: RegionChip; label: string }[]`, `VIBE_CHIPS: { id: VibeChip; label: string }[]`
  - `interface TopPlace { name: string; type: ActivityType; lat: number; lng: number; placeId: string | null; itineraryCount: number }`
  - `interface Destination { slug; name; countryCode; countryName; continentChip: Exclude<RegionChip,'all'>; vibes: string[]; popularity: number; center: { lat: number; lng: number }; coverImageUrl: string | null; placeId: string | null; topPlaces: TopPlace[]; itineraryCount: number }`
  - `parseDestination(id: string, data: Record<string, unknown>): Destination | null`
  - `filterDestinations(list: Destination[], region: RegionChip, vibe: VibeChip): Destination[]`
  - `findDestination(list: Destination[], slug: string): Destination | null`
  - `destinationEyebrow(d: Destination): string`
  - `matchDestinations(list: Destination[], query: string, limit?: number): Destination[]`
  - `splitDestinationTrips(trips: Trip[]): { editorial: Trip[]; community: Trip[] }`
  - `topPlaceToPlace(p: TopPlace): EnrichedPlace`
  - `placeShare(p: TopPlace, itineraryCount: number): string`
  - `heatFeatures(points: unknown, stride: unknown): GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }>`
  - `destinationPinFeatures(list: Destination[]): GeoJSON.FeatureCollection<GeoJSON.Point, { slug: string; name: string; weight: number }>`
  - `destinationSlugFromFeatures(fc: GeoJSON.FeatureCollection | undefined | null): string | null`

- [ ] **Step 1: Write the failing tests**

`__tests__/utils/destinations.test.ts`:

```ts
import {
  parseDestination, filterDestinations, findDestination, destinationEyebrow, matchDestinations,
  splitDestinationTrips, topPlaceToPlace, placeShare, type Destination,
} from '@/utils/destinations';
import type { Trip } from '@/types';

const raw = (over: Record<string, unknown> = {}) => ({
  slug: 'lisbon', name: 'Lisbon', countryCode: 'PT', countryName: 'Portugal', continentChip: 'europe',
  vibes: ['food', 'culture'], popularity: 82, center: { lat: 38.7, lng: -9.1 },
  coverImageUrl: 'https://x/photo', placeId: 'ChIJ', itineraryCount: 4,
  topPlaces: [{ name: 'Pastéis de Belém', type: 'restaurant', lat: 38.69, lng: -9.2, placeId: null, itineraryCount: 3 }],
  ...over,
});
const dest = (over: Record<string, unknown> = {}) => parseDestination(String(over.slug ?? 'lisbon'), raw(over)) as Destination;

describe('parseDestination', () => {
  it('reads a seeded document', () => {
    const d = dest();
    expect(d).toMatchObject({ slug: 'lisbon', name: 'Lisbon', continentChip: 'europe', itineraryCount: 4 });
    expect(d.topPlaces[0]).toEqual({ name: 'Pastéis de Belém', type: 'restaurant', lat: 38.69, lng: -9.2, placeId: null, itineraryCount: 3 });
  });
  it('rejects a document with no name or centre, and defaults the rest', () => {
    expect(parseDestination('x', { name: 'X' })).toBeNull();
    expect(parseDestination('x', { center: { lat: 1, lng: 2 } })).toBeNull();
    const d = parseDestination('x', { name: 'X', center: { lat: 1, lng: 2 } })!;
    expect(d).toMatchObject({ vibes: [], topPlaces: [], itineraryCount: 0, coverImageUrl: null, popularity: 0 });
  });
  it('drops top places that are not sights or restaurants or have no coordinates', () => {
    const d = dest({ topPlaces: [{ name: 'A', type: 'hotel', lat: 1, lng: 1, itineraryCount: 1 }, { name: 'B', type: 'activity', lat: null, lng: 1, itineraryCount: 1 }] });
    expect(d.topPlaces).toEqual([]);
  });
});

describe('filterDestinations', () => {
  const list = [
    dest({ slug: 'lisbon', popularity: 82 }),
    dest({ slug: 'tokyo', name: 'Tokyo', continentChip: 'asia', vibes: ['food', 'nightlife'], popularity: 97 }),
    dest({ slug: 'bali', name: 'Bali', continentChip: 'asia', vibes: ['beaches', 'nature'], popularity: 90 }),
  ];
  it('returns everything by popularity for All + All', () => {
    expect(filterDestinations(list, 'all', 'all').map((d) => d.slug)).toEqual(['tokyo', 'bali', 'lisbon']);
  });
  it('applies region and vibe together', () => {
    expect(filterDestinations(list, 'asia', 'food').map((d) => d.slug)).toEqual(['tokyo']);
  });
  it('returns an empty list when nothing matches', () => {
    expect(filterDestinations(list, 'oceania', 'nightlife')).toEqual([]);
  });
});

describe('findDestination', () => {
  it('finds by slug or returns null', () => {
    expect(findDestination([dest()], 'lisbon')?.name).toBe('Lisbon');
    expect(findDestination([dest()], 'atlantis')).toBeNull();
  });
});

describe('destinationEyebrow', () => {
  it('names the country and the itineraries', () => {
    expect(destinationEyebrow(dest())).toBe('PORTUGAL · 4 TRIPS');
    expect(destinationEyebrow(dest({ itineraryCount: 1 }))).toBe('PORTUGAL · 1 TRIP');
    expect(destinationEyebrow(dest({ itineraryCount: 0 }))).toBe('PORTUGAL');
  });
});

describe('matchDestinations', () => {
  const list = [dest(), dest({ slug: 'sao-paulo', name: 'São Paulo', countryName: 'Brazil', popularity: 60 }), dest({ slug: 'new-york-city', name: 'New York City', countryName: 'United States', popularity: 99 })];
  it('matches the start of any word, ignoring case and accents', () => {
    expect(matchDestinations(list, 'sao').map((d) => d.slug)).toEqual(['sao-paulo']);
    expect(matchDestinations(list, 'york').map((d) => d.slug)).toEqual(['new-york-city']);
    expect(matchDestinations(list, 'portu').map((d) => d.slug)).toEqual(['lisbon']);
  });
  it('needs two characters and caps the list', () => {
    expect(matchDestinations(list, 'l')).toEqual([]);
    expect(matchDestinations([...list, ...list, ...list], 'l', 2)).toHaveLength(2);
  });
});

describe('splitDestinationTrips', () => {
  const t = (id: string, isEditorial?: boolean) => ({ id, isEditorial }) as unknown as Trip;
  it('puts Supernova picks first, keeps order, and never lists a trip twice', () => {
    const out = splitDestinationTrips([t('a'), t('b', true), t('c'), t('b', true)]);
    expect(out.editorial.map((x) => x.id)).toEqual(['b']);
    expect(out.community.map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('topPlaceToPlace / placeShare', () => {
  const p = { name: 'Santa Justa Lift', type: 'activity' as const, lat: 38.71, lng: -9.14, placeId: null, itineraryCount: 3 };
  it('seeds a tier1 place with an empty id when there is no Google place', () => {
    expect(topPlaceToPlace(p)).toEqual({ placeId: '', name: 'Santa Justa Lift', address: '', lat: 38.71, lng: -9.14, countryCode: null, tier: 'tier1' });
    expect(topPlaceToPlace({ ...p, placeId: 'ChIJx' }).placeId).toBe('ChIJx');
  });
  it('says how many itineraries include it', () => {
    expect(placeShare(p, 4)).toBe('In 3 of 4 itineraries');
    expect(placeShare({ ...p, itineraryCount: 1 }, 1)).toBe('In 1 itinerary');
  });
});
```

`__tests__/utils/heatmap.test.ts`:

```ts
import { heatFeatures, destinationPinFeatures, destinationSlugFromFeatures } from '@/utils/heatmap';
import { parseDestination } from '@/utils/destinations';

describe('heatFeatures', () => {
  it('unflattens [lng, lat, w] triples', () => {
    const fc = heatFeatures([-9.1, 38.7, 20, 139.7, 35.6, 3], 3);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]).toMatchObject({ geometry: { type: 'Point', coordinates: [-9.1, 38.7] }, properties: { w: 20 } });
  });
  it('draws nothing for a missing, wrong-stride or empty document', () => {
    expect(heatFeatures(undefined, 3).features).toEqual([]);
    expect(heatFeatures([1, 2, 3], 2).features).toEqual([]);
    expect(heatFeatures([], 3).features).toEqual([]);
  });
  it('skips a trailing partial triple and invalid values', () => {
    const fc = heatFeatures([1, 2, 3, 4, 95, 1, 5, NaN, 1, 6, 7, 2, 8], 3);
    expect(fc.features.map((f) => f.geometry.coordinates)).toEqual([[1, 2], [6, 7]]);
  });
});

describe('destination pins', () => {
  const d = parseDestination('lisbon', { name: 'Lisbon', center: { lat: 38.7, lng: -9.1 }, popularity: 82 })!;
  it('puts each destination at its centre, weighted by popularity', () => {
    expect(destinationPinFeatures([d]).features[0]).toMatchObject({
      geometry: { coordinates: [-9.1, 38.7] }, properties: { slug: 'lisbon', name: 'Lisbon', weight: 82 },
    });
  });
  it('reads the slug of a tapped pin, ignoring other features', () => {
    const fc = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { class: 'poi' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: { slug: 'lisbon' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ] } as GeoJSON.FeatureCollection;
    expect(destinationSlugFromFeatures(fc)).toBe('lisbon');
    expect(destinationSlugFromFeatures(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/utils/destinations.test.ts __tests__/utils/heatmap.test.ts`
Expected: FAIL — `Cannot find module '@/utils/destinations'`.

- [ ] **Step 3: Implement**

`types/index.ts`, inside `interface Trip` (beside `moderationHidden`):

```ts
  /** Written only by the Admin SDK seed for the "Supernova" editorial account; rules forbid clients setting it. */
  isEditorial?: boolean;
  /** Catalog slugs this public trip falls in (tagTripDestinations). */
  destinationKeys?: string[];
```

`utils/destinations.ts`:

```ts
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
```

`utils/heatmap.ts`:

```ts
import type * as GeoJSON from 'geojson';
import type { Destination } from '@/utils/destinations';

/**
 * aggregates/heatmap stores points flattened — [lng, lat, w, lng, lat, w, …]
 * with stride 3 — because Firestore rejects nested arrays. Anything that
 * doesn't parse is skipped; a broken document draws no layer rather than
 * breaking the globe.
 */
export function heatFeatures(points: unknown, stride: unknown): GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }> {
  const features: GeoJSON.Feature<GeoJSON.Point, { w: number }>[] = [];
  if (Array.isArray(points) && stride === 3) {
    for (let i = 0; i + 2 < points.length; i += 3) {
      const [lng, lat, w] = [points[i], points[i + 1], points[i + 2]];
      if (![lng, lat, w].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      if (Math.abs(lat) > 90) continue;
      features.push({ type: 'Feature', properties: { w }, geometry: { type: 'Point', coordinates: [lng, lat] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function destinationPinFeatures(list: Destination[]): GeoJSON.FeatureCollection<GeoJSON.Point, { slug: string; name: string; weight: number }> {
  return {
    type: 'FeatureCollection',
    features: list.map((d) => ({
      type: 'Feature' as const,
      id: d.slug,
      properties: { slug: d.slug, name: d.name, weight: d.popularity },
      geometry: { type: 'Point' as const, coordinates: [d.center.lng, d.center.lat] },
    })),
  };
}

/** The destination pin under a tap, from queryRenderedFeaturesInRect on the pin layers. */
export function destinationSlugFromFeatures(fc: GeoJSON.FeatureCollection | undefined | null): string | null {
  for (const f of fc?.features ?? []) {
    const slug = (f.properties as { slug?: unknown } | null)?.slug;
    if (typeof slug === 'string' && slug) return slug;
  }
  return null;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest __tests__/utils/destinations.test.ts __tests__/utils/heatmap.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add utils/destinations.ts utils/heatmap.ts types/index.ts __tests__/utils/destinations.test.ts __tests__/utils/heatmap.test.ts
git commit -m "feat: pure rules for the destination catalog and heat map"
```

---

### Task 2: Discovery hooks

**Files:**
- Create: `hooks/useDestinations.ts`, `hooks/useHeatmap.ts`

**Interfaces:**
- Consumes: Task 1's `parseDestination`, `findDestination`, `splitDestinationTrips`, `heatFeatures`.
- Produces:
  - `useDestinations(): { destinations: Destination[]; isLoading: boolean; isError: boolean }`
  - `useDestination(slug: string): { destination: Destination | null; isLoading: boolean }`
  - `useDestinationTrips(slug: string): { editorial: Trip[]; community: Trip[]; isLoading: boolean }`
  - `useHeatmap(): GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }> | null`

Hooks are I/O shells over Task 1's tested rules; this repo tests no hooks. Verification is `npx tsc --noEmit` and the on-device pass in Task 7.

- [ ] **Step 1: Write `hooks/useDestinations.ts`**

```ts
import { useMemo } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import type { Trip } from '@/types';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';
import { parseDestination, findDestination, splitDestinationTrips, type Destination } from '@/utils/destinations';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

async function fetchDestinations(): Promise<Destination[]> {
  const snap = await getDocs(collection(db, 'destinations'));
  return snap.docs
    .map((d) => parseDestination(d.id, d.data()))
    .filter((d): d is Destination => !!d);
}

/** The whole catalog, once: ~30 reads, cached 12 h (it changes daily at most). */
export function useDestinations(): { destinations: Destination[]; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['destinations'],
    queryFn: fetchDestinations,
    staleTime: TWELVE_HOURS,
  });
  return { destinations: data ?? [], isLoading, isError };
}

/** One destination, from the same cached catalog — a cold deep link loads it too. */
export function useDestination(slug: string): { destination: Destination | null; isLoading: boolean } {
  const { destinations, isLoading } = useDestinations();
  const destination = useMemo(() => findDestination(destinations, slug), [destinations, slug]);
  return { destination, isLoading };
}

/**
 * Public itineraries tagged with this destination, most saved first, split
 * into Supernova picks and travelers' trips. Uses the declared
 * (visibility, destinationKeys CONTAINS, savesCount DESC) index.
 */
export function useDestinationTrips(slug: string): { editorial: Trip[]; community: Trip[]; isLoading: boolean } {
  const moderation = useModeration();
  const { data = [], isLoading } = useQuery({
    queryKey: ['destinationTrips', slug],
    queryFn: async (): Promise<Trip[]> => {
      const snap = await getDocs(query(
        collection(db, 'trips'),
        where('visibility', '==', 'public'),
        where('destinationKeys', 'array-contains', slug),
        orderBy('savesCount', 'desc'),
        limit(30),
      ));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trip);
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!slug,
  });
  const split = useMemo(() => splitDestinationTrips(filterVisible(data, moderation, (t) => ({
    authorUid: t.authorUid,
    key: contentKey({ type: 'trip', id: t.id }),
    moderationHidden: t.moderationHidden,
  }))), [data, moderation]);
  return { ...split, isLoading };
}
```

- [ ] **Step 2: Write `hooks/useHeatmap.ts`**

```ts
import { doc, getDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import type * as GeoJSON from 'geojson';
import { db } from '@/services/firebase';
import { heatFeatures } from '@/utils/heatmap';

/**
 * The globe's heat layer: one read of aggregates/heatmap, cached 12 h
 * (aggregateDiscovery rewrites it daily). Null until loaded or when empty —
 * the globe then simply has no heat layer.
 */
export function useHeatmap(): GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }> | null {
  const { data } = useQuery({
    queryKey: ['heatmap'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'aggregates', 'heatmap'));
      const d = snap.data();
      return heatFeatures(d?.points, d?.stride);
    },
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
  return data && data.features.length > 0 ? data : null;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "useDestinations|useHeatmap" ; echo done`
Expected: no lines before `done`.

- [ ] **Step 4: Commit**

```bash
git add hooks/useDestinations.ts hooks/useHeatmap.ts
git commit -m "feat: catalog, destination trips and heat map hooks"
```

---

### Task 3: Explore — chips and destination grid

**Files:**
- Create: `components/explore/DestinationCard.tsx`, `components/explore/FilterChips.tsx`
- Modify: `app/(tabs)/explore.tsx` (remove `deriveTrending`, the Trending section and the `TrendingCard` import; add chips + grid)
- Delete: `components/explore/TrendingCard.tsx` (its only consumer is the removed section — confirm with `grep -rn TrendingCard app components`; a mention in a `utils/layout.ts` comment gets reworded to `DestinationCard`)

**Interfaces:**
- Consumes: `useDestinations`, `filterDestinations`, `destinationEyebrow`, `REGION_CHIPS`, `VIBE_CHIPS`, `RegionChip`, `VibeChip`.
- Produces: `DestinationCard({ destination, onPress })`, `FilterChips<T extends string>({ items, selected, onSelect, label })`.

Layout from the spec: header (star + "Explore" + wallet) → region chips → vibe chips (one active per row) → destination grid (`useLayout().columns`; tall photo, bottom gradient, eyebrow `PORTUGAL · 4 TRIPS`, name), sorted by popularity → "Latest trips" → "People to follow".

- [ ] **Step 1: `components/explore/FilterChips.tsx`**

```tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';

interface FilterChipsProps<T extends string> {
  items: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  /** Read by VoiceOver before the chips: "Region", "Vibe". */
  label: string;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    scale.setValue(0.92);
    Animated.spring(scale, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }).start();
  }, [active, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          styles.chip,
          active
            ? { backgroundColor: colors.text.primary }
            : { backgroundColor: colors.background.secondary },
        ]}
      >
        <Text style={[styles.chipText, { color: active ? colors.background.primary : colors.text.secondary }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function FilterChips<T extends string>({ items, selected, onSelect, label }: FilterChipsProps<T>) {
  const handle = useCallback((id: T) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(id);
  }, [onSelect]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={label}
    >
      {items.map((it) => (
        <Chip key={it.id} label={it.label} active={it.id === selected} onPress={() => handle(it.id)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing['6'], gap: Spacing['2'] },
  // 44pt tall: the touch-target floor, and a comfortable pill.
  chip: { minHeight: 44, paddingHorizontal: Spacing['4'], borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
```

Before writing it, check the theme token names with `grep -n "secondary\|tertiary" constants/colors.ts | head` and use the sunken-chip token (`#F0EAE0` in light) for the unselected fill; adjust `colors.background.secondary` to whichever key holds it.

- [ ] **Step 2: `components/explore/DestinationCard.tsx`**

Model it on the deleted `TrendingCard` (same photo-failure fallback, same scrim, `columnWidth(width, columns)` sizing) with three differences: height is `Math.round(cardWidth * 1.3)` (tall photo), text is the eyebrow (`destinationEyebrow`, 11pt, weight 500, letterSpacing `0.08 * 11`, white at 0.85 opacity) above the name (17pt, weight 600, white), and the placeholder for a missing/failed photo is a sunken surface with a `MapPin` duotone icon in `colors.text.disabled`, the eyebrow and the name in theme text colors.

```tsx
interface DestinationCardProps {
  destination: Destination;
  onPress: (slug: string) => void;
}
// onPress is called with destination.slug; Light haptic inside, as TrendingCard did.
// accessibilityLabel: `${destination.name}, ${destination.countryName}`.
```

- [ ] **Step 3: Rewrite the Explore body**

In `app/(tabs)/explore.tsx`: delete `TrendingDestination`, `deriveTrending`, `trending`, `handleTrendingPress` and the Trending section. Add:

```tsx
import { useDestinations } from '@/hooks/useDestinations';
import { filterDestinations, REGION_CHIPS, VIBE_CHIPS, type RegionChip, type VibeChip } from '@/utils/destinations';
import { DestinationCard } from '@/components/explore/DestinationCard';
import { FilterChips } from '@/components/explore/FilterChips';
import { Compass } from 'phosphor-react-native';

const { destinations, isLoading: destinationsLoading } = useDestinations();
const [region, setRegion] = useState<RegionChip>('all');
const [vibe, setVibe] = useState<VibeChip>('all');
const shown = useMemo(() => filterDestinations(destinations, region, vibe), [destinations, region, vibe]);

// The grid springs in again whenever the filter changes.
const gridAnim = useRef(new Animated.Value(1)).current;
useEffect(() => {
  gridAnim.setValue(0);
  Animated.spring(gridAnim, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }).start();
}, [region, vibe, gridAnim]);

const handleDestinationPress = useCallback((slug: string) => {
  router.push(`/destination/${slug}`);
}, [router]);
const handleClearFilters = useCallback(() => { setRegion('all'); setVibe('all'); }, []);
```

Render, in place of the Trending section (the subtitle becomes "Where to next"):

```tsx
{(destinationsLoading || destinations.length > 0) && (
  <View style={styles.section}>
    <View style={styles.chipRows}>
      <FilterChips items={REGION_CHIPS} selected={region} onSelect={setRegion} label="Region" />
      <FilterChips items={VIBE_CHIPS} selected={vibe} onSelect={setVibe} label="Vibe" />
    </View>
    {destinationsLoading ? (
      <View style={styles.tripGridSkeleton}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} width={gridItemWidth} height={Math.round(gridItemWidth * 1.3)} radius={BorderRadius.xl} />
        ))}
      </View>
    ) : shown.length === 0 ? (
      <EmptyState
        icon={Compass}
        title="No destinations match yet"
        description="We're adding places every week. Try another region or vibe."
        actionLabel="Clear filters"
        onAction={handleClearFilters}
        actionHaptic="light"
      />
    ) : (
      <Animated.View style={[styles.destinationGrid, { opacity: gridAnim, transform: [{ translateY: gridAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        {shown.map((d) => <DestinationCard key={d.slug} destination={d} onPress={handleDestinationPress} />)}
      </Animated.View>
    )}
    {shown.some((d) => d.coverImageUrl) && (
      <Text style={[styles.attribution, { color: colors.text.tertiary }]}>Powered by Google</Text>
    )}
  </View>
)}
```

Styles: `chipRows: { gap: Spacing['2'], marginBottom: Spacing['4'] }`, `destinationGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing['6'], gap: Spacing['3'] }`. Check `EmptyState`'s prop names against `components/ui/EmptyState.tsx:10-37` before using them.

- [ ] **Step 4: Type-check, lint, tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "explore|DestinationCard|FilterChips"; npm run lint 2>&1 | grep -E "error" ; npx jest 2>&1 | grep -E "^Tests:"`
Expected: no tsc lines, no lint errors, all tests pass. If `__tests__/utils/trendingPlaces.test.ts` still passes it stays (the globe used `aggregateDestinations` until Task 6).

- [ ] **Step 5: Commit**

```bash
git add -A components/explore app/\(tabs\)/explore.tsx utils/layout.ts
git commit -m "feat: Explore destination grid with region and vibe chips"
```

---

### Task 4: Destination page

**Files:**
- Create: `app/destination/[slug].tsx`
- Modify: `app/_layout.tsx` (register `<Stack.Screen name="destination/[slug]" />`, a full-screen push like `user/[uid]`), `utils/layout.ts` (add `'destination/[slug]'` to `READING_COLUMN_ROUTES.root`)
- Test: `__tests__/utils/layout.test.ts` (one assertion)

**Interfaces:**
- Consumes: `useDestination`, `useDestinationTrips`, `destinationEyebrow`, `topPlaceToPlace`, `placeShare`, `TripCard`, `useAuthorProfiles`, `PlaceDetailSheet`, `ACTIVITY_ICONS`.

Page, top to bottom (spec Part 3 "Destination page"):
1. Hero photo (`coverImageUrl`, ~360pt tall, full bleed, bottom gradient), back button (top-left, 44pt, `accessibilityLabel="Back"`), "Powered by Google" under it when it's a Google photo.
2. Eyebrow `PORTUGAL · EUROPE` (country + region label from `REGION_CHIPS`), title (28pt/600, `-0.02em`), vibe tags (`Badge`s from `VIBE_CHIPS` labels).
3. Primary CTA **Plan my trip here** (the hero gradient variant of `Button`, the flow's one gradient), `Medium` haptic → `router.push({ pathname: '/trip/ai-generate', params: { destination: name, countryCode, placeId: placeId ?? '' } })`.
4. **Supernova picks** — editorial `TripCard`s (one column on phone, `useLayout().cardListColumns` on iPad), then **From travelers** — community trips. Author row from `useAuthorProfiles`. Skeleton cards while loading. With no trips at all: `EmptyState` (`MapTrifold`, "Be the first to share a trip here", "Plan one with AI or by hand, set it to public, and it shows up on this page.", action "Plan my trip here" — the same verb, so the screen still has one action).
5. **Places to go** — `topPlaces` rows: `TypeIconBubble`/`ACTIVITY_ICONS[type]` icon, name, `placeShare(p, itineraryCount)` caption; tap (`Light`) → `PlaceDetailSheet` with `topPlaceToPlace(p)` (spring in like `app/trip/[id].tsx:267-285`). Hidden when there are none.
6. Not found (catalog loaded, slug unknown): `EmptyState` (`Compass`, "This destination isn't in our guide yet", "Explore has every place we cover.", action "Back to Explore" → `router.back()`).

- [ ] **Step 1: Write the failing layout test**

Add to `__tests__/utils/layout.test.ts`, in the `usesReadingColumn` describe block:

```ts
it('gives the destination page the reading column', () => {
  expect(usesReadingColumn('root', 'destination/[slug]')).toBe(true);
});
```

- [ ] **Step 2: Run it** — `npx jest __tests__/utils/layout.test.ts` → FAIL (expected true, received false).

- [ ] **Step 3: Add the route to `READING_COLUMN_ROUTES.root`** and register the screen in `app/_layout.tsx` after `user/[uid]`:

```tsx
<Stack.Screen name="destination/[slug]" />
```

- [ ] **Step 4: Run it** — PASS.

- [ ] **Step 5: Write `app/destination/[slug].tsx`**

Structure (state + handlers; render the sections listed above in a `ScrollView` with `contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}`, background `colors.background.primary`, wrapped in `ScreenEntrance`):

```tsx
const { slug } = useLocalSearchParams<{ slug: string }>();
const { destination, isLoading } = useDestination(slug ?? '');
const { editorial, community, isLoading: tripsLoading } = useDestinationTrips(slug ?? '');
const { data: authors = {} } = useAuthorProfiles([...editorial, ...community].map((t) => t.authorUid));
const [place, setPlace] = useState<EnrichedPlace | null>(null);
const placeSlide = useRef(new Animated.Value(600)).current;

const openPlace = useCallback((p: TopPlace) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setPlace(topPlaceToPlace(p));
  Animated.spring(placeSlide, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
}, [placeSlide]);
const closePlace = useCallback(() => {
  Animated.spring(placeSlide, { toValue: 600, tension: 65, friction: 11, useNativeDriver: true }).start(() => setPlace(null));
}, [placeSlide]);
const planHere = useCallback(() => {
  if (!destination) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  router.push({
    pathname: '/trip/ai-generate',
    params: { destination: destination.name, countryCode: destination.countryCode, ...(destination.placeId ? { placeId: destination.placeId } : {}) },
  });
}, [destination]);
const openTrip = useCallback((id: string) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  router.push(`/trip/${id}`);
}, []);
```

Match `PlaceDetailSheet`'s `slideAnim` direction to how `app/trip/[id].tsx` drives it (read lines 267-285 and copy its open/close values exactly — the sketch above assumes 0 = open, 600 = closed). Render the sheet last, `{place ? <PlaceDetailSheet place={place} slideAnim={placeSlide} bottomInset={insets.bottom} onDismiss={closePlace} /> : null}`. A "Supernova pick" `Badge` goes on each editorial card via `TripCard`'s `style` wrapper (a `View` around the card with the badge absolutely positioned top-left) — `TripCard` itself is not changed.

The AI form does not treat an empty `placeId` as no place; confirm by reading `app/trip/ai-generate.tsx:61-69` (`useState(params.placeId ?? null)` would keep an empty string, which is why `planHere` omits the param when there's no placeId).

- [ ] **Step 6: Type-check, lint, tests** — as Task 3 Step 4, grepping for `destination/`.

- [ ] **Step 7: Commit**

```bash
git add app/destination app/_layout.tsx utils/layout.ts __tests__/utils/layout.test.ts
git commit -m "feat: destination page — picks, travelers' trips, places to go, plan with AI"
```

---

### Task 5: Flyover pauses at each stop (reducer)

**Files:**
- Modify: `utils/flyover.ts`
- Test: `__tests__/utils/flyover.test.ts` (update existing tick calls to pass `stopFractions`; replace `DAY_HOLD_MS` with `STOP_DWELL_MS`)

**Interfaces:**
- Produces:
  - `FlyoverState` gains `stopIndex: number` — index into the current day's stops of the stop last reached (−1 when idle).
  - `tick` action gains `stopFractions: number[][]` (per day, from `BuiltPath.stopFractions`).
  - `STOP_DWELL_MS = 2500` (replaces `DAY_HOLD_MS`; the day's first stop is shown for the same time).
  - `stopEyebrow(dayNumber: number, dateLabel: string | null, stopIndex: number, stopCount: number): string`

- [ ] **Step 1: Write the failing tests** (append; then update the old tests' `tick` actions to include `stopFractions` matching their days, and `DAY_HOLD_MS` → `STOP_DWELL_MS`)

```ts
import { flyoverReducer, initialFlyover, STOP_DWELL_MS, stopEyebrow, type FlyoverState, type FlyoverAction } from '@/utils/flyover';

const run = (s: FlyoverState, ...actions: FlyoverAction[]) => actions.reduce(flyoverReducer, s);
const tick = (dt: number, durations: number[], stopFractions: number[][]): FlyoverAction => ({ type: 'tick', dt, durations, stopFractions });

describe('flyover stop pauses', () => {
  const D = [10_000], F = [[0, 0.5, 1]];

  it('shows the first stop while the day starts', () => {
    const s = run(initialFlyover, { type: 'play' });
    expect(s).toMatchObject({ status: 'playing', dayIndex: 0, stopIndex: 0, hold: STOP_DWELL_MS, progress: 0 });
  });

  it('stops the drawing head at each stop and dwells there', () => {
    let s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, D, F));
    expect(s).toMatchObject({ hold: 0, stopIndex: 0 });
    s = run(s, tick(6_000, D, F)); // would reach 0.6 — clamps to the stop at 0.5
    expect(s).toMatchObject({ progress: 0.5, stopIndex: 1, hold: STOP_DWELL_MS });
    s = run(s, tick(1_000, D, F));
    expect(s).toMatchObject({ progress: 0.5, stopIndex: 1, hold: STOP_DWELL_MS - 1_000 });
    s = run(s, tick(1_500, D, F), tick(6_000, D, F));
    expect(s).toMatchObject({ progress: 1, stopIndex: 2, hold: STOP_DWELL_MS });
    s = run(s, tick(STOP_DWELL_MS, D, F), tick(33, D, F));
    expect(s.status).toBe('done');
  });

  it('pauses separately at two stops in the same spot', () => {
    const F2 = [[0, 0.5, 0.5, 1]];
    let s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, D, F2), tick(6_000, D, F2));
    expect(s).toMatchObject({ stopIndex: 1, hold: STOP_DWELL_MS });
    s = run(s, tick(STOP_DWELL_MS, D, F2), tick(33, D, F2));
    expect(s).toMatchObject({ stopIndex: 2, progress: 0.5, hold: STOP_DWELL_MS });
  });

  it('rolls into the next day after the last stop, starting on its first stop', () => {
    const DD = [10_000, 10_000], FF = [[0, 1], [0, 1]];
    const s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, DD, FF), tick(10_000, DD, FF), tick(STOP_DWELL_MS, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 1, stopIndex: 0, progress: 0, hold: STOP_DWELL_MS });
  });

  it('skips a day with no path without dwelling', () => {
    const DD = [10_000, 0, 10_000], FF = [[0, 1], [0], [0, 1]];
    const s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, DD, FF), tick(10_000, DD, FF), tick(STOP_DWELL_MS, DD, FF), tick(33, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 2, stopIndex: 0, hold: STOP_DWELL_MS });
  });

  it('keeps the dwell while paused, and a jump starts the day on its first stop', () => {
    let s = run(initialFlyover, { type: 'play' }, tick(1_000, D, F), { type: 'pause' }, tick(5_000, D, F));
    expect(s).toMatchObject({ status: 'paused', hold: STOP_DWELL_MS - 1_000 });
    s = run(s, { type: 'jump', dayIndex: 0 });
    expect(s).toMatchObject({ status: 'playing', stopIndex: 0, hold: STOP_DWELL_MS, progress: 0 });
  });
});

describe('stopEyebrow', () => {
  it('reads day, date and stop', () => {
    expect(stopEyebrow(2, 'SAT, NOV 25', 2, 6)).toBe('DAY 2 · SAT, NOV 25 · STOP 3 OF 6');
    expect(stopEyebrow(1, null, 0, 1)).toBe('DAY 1 · STOP 1 OF 1');
  });
});
```

- [ ] **Step 2: Run** — `npx jest __tests__/utils/flyover.test.ts` → FAIL (`STOP_DWELL_MS` / `stopEyebrow` undefined, `stopIndex` missing).

- [ ] **Step 3: Implement** — replace the state, constants and `tick` in `utils/flyover.ts`:

```ts
export interface FlyoverState {
  status: FlyoverStatus;
  dayIndex: number;
  /** 0 → 1 along the current day's path. */
  progress: number;
  /** Milliseconds still to dwell on the current stop before drawing on. */
  hold: number;
  /** The current day's stop last reached, shown in the card; −1 when idle. */
  stopIndex: number;
}

export type FlyoverAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick'; dt: number; durations: number[]; stopFractions: number[][] }
  | { type: 'jump'; dayIndex: number }
  | { type: 'stop' };

/**
 * How long the flyover rests on each stop — the camera settles on it and the
 * card shows it — before drawing on to the next. The first stop of a day gets
 * the same rest, which also gives the map time to load its tiles.
 */
export const STOP_DWELL_MS = 2500;

export const initialFlyover: FlyoverState = { status: 'idle', dayIndex: 0, progress: 0, hold: 0, stopIndex: -1 };

const startOfDay = (dayIndex: number): FlyoverState => ({ status: 'playing', dayIndex, progress: 0, hold: STOP_DWELL_MS, stopIndex: 0 });

function nextDay(state: FlyoverState, durations: number[]): FlyoverState {
  if (state.dayIndex >= durations.length - 1) return { ...state, status: 'done', progress: 1, hold: 0 };
  return startOfDay(state.dayIndex + 1);
}
```

and the `tick` case:

```ts
    case 'tick': {
      if (state.status !== 'playing') return state;
      const duration = action.durations[state.dayIndex] ?? 0;
      // A day with no path: nothing to draw or show.
      if (duration <= 0) return nextDay(state, action.durations);
      let dt = action.dt;
      if (state.hold > 0) {
        const hold = state.hold - Math.min(state.hold, dt);
        dt -= state.hold - hold;
        if (hold > 0 || dt <= 0) return { ...state, hold };
      }
      if (state.progress >= 1) return nextDay(state, action.durations);
      const progress = Math.min(1, state.progress + dt / duration);
      // The next stop on the line: stop the head there and dwell. One stop per
      // tick, so two stops at the same spot each get their own pause.
      const next = state.stopIndex + 1;
      const at = action.stopFractions[state.dayIndex]?.[next];
      if (at !== undefined && progress >= at) return { ...state, progress: at, stopIndex: next, hold: STOP_DWELL_MS };
      if (progress >= 1) return nextDay(state, action.durations);
      return { ...state, progress, hold: 0 };
    }
```

(`play`, `pause`, `stop`, `jump` keep their code; `play` from idle/done and `jump` use the new `startOfDay`.) Add:

```ts
/** `DAY 2 · SAT, NOV 25 · STOP 3 OF 6` — the flyover card's eyebrow. */
export function stopEyebrow(dayNumber: number, dateLabel: string | null, stopIndex: number, stopCount: number): string {
  return [`DAY ${dayNumber}`, dateLabel, `STOP ${stopIndex + 1} OF ${stopCount}`].filter(Boolean).join(' · ');
}
```

Delete `DAY_HOLD_MS`. Update the file's doc comment: the flyover draws each day, resting `STOP_DWELL_MS` on every stop.

- [ ] **Step 4: Run** — `npx jest __tests__/utils/flyover.test.ts` → PASS (new and updated tests).

- [ ] **Step 5: Commit**

```bash
git add utils/flyover.ts __tests__/utils/flyover.test.ts
git commit -m "feat: flyover rests on each stop before drawing on"
```

---

### Task 6: Wire it up — trip map stop showcase, globe heat map and destination pins

**Files:**
- Modify: `components/trip/TripMapView.tsx` (flyover wiring ~lines 340–505, markers ~995–1018, card ~1252–1296)
- Modify: `components/search/GlobeMapView.tsx`, `app/(tabs)/search.tsx`
- Create: `components/search/DestinationResult.tsx`
- Delete: `hooks/useTrendingPlaces.ts`, `utils/trendingPlaces.ts`, `__tests__/utils/trendingPlaces.test.ts` (replaced by catalog pins; confirm no other importer with `grep -rn "trendingPlaces\|useTrendingPlaces" app components hooks utils`)

**Interfaces:**
- Consumes: Task 5's `stopIndex`, `STOP_DWELL_MS`, `stopEyebrow`, `tick.stopFractions`; Task 1's `destinationPinFeatures`, `destinationSlugFromFeatures`, `matchDestinations`; Task 2's `useDestinations`, `useHeatmap`.
- Produces: `GlobeMapView` props `destinations?: Destination[]` and `heat?: GeoJSON.FeatureCollection | null` (replacing `trendingPlaces`); exported layer ids `DESTINATION_PIN_LAYERS = ['destination-pin', 'destination-label']`.

**Trip map (stop showcase):**

- [ ] **Step 1: Feed stops to the reducer and follow them with the camera**

```tsx
const stopFractions = useMemo(() => flightPaths.map((d) => d.path.stopFractions), [flightPaths]);
// in the rAF loop:
dispatch({ type: 'tick', dt: now - last, durations, stopFractions });
// (add stopFractions to that effect's deps)
```

In the follow-camera effect's `move`, return early while dwelling — the stop has the camera: `if (flyoverRef.current.hold > 0) return;`. Remove the initial `move(1400)` (the stop showcase below now frames each day's start). Add a showcase effect:

```tsx
// Each stop the head reaches: fly in close and tilt, while the card shows it.
const flyStop = flying ? flightPaths[flyover.dayIndex]?.stops[flyover.stopIndex] : undefined;
useEffect(() => {
  if (flyover.status !== 'playing' || !flyStop) return;
  cameraRef.current?.setCamera({
    centerCoordinate: [flyStop.lng, flyStop.lat],
    zoomLevel: 16,
    pitch: 60,
    animationDuration: 1200,
    animationMode: 'flyTo',
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per stop reached, not per tick
}, [flyover.status === 'playing', flyover.dayIndex, flyover.stopIndex]);
```

Replace the old `const flyStop = flyDay ? [...flyDay.stops].reverse().find(...)` with the line above (moved before the effect).

- [ ] **Step 2: Emphasise the stop being shown**

In the marker map, for `const showcased = stop.activity.id === flyStop?.activity.id;` render `bubbleSize={showcased ? 44 : 32}`, `iconSize={showcased ? 24 : 18}`, `isCurrent={showcased || stop.activity.id === currentActivityId}`, and key the `SpringIn` wrapper as `` key={`${stop.activity.id}-${showcased ? 'on' : 'off'}`} `` so it pops each time it's reached.

- [ ] **Step 3: The card shows the stop**

Replace the card's eyebrow + title with (wrapped in `<SpringIn key={flyStop?.activity.id ?? 'none'}>` so each stop's card springs in):

```tsx
const dateLabel = flyDayMeta?.date
  ? flyDayMeta.date.toDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
  : null;
// …
<View style={styles.flyStopRow}>
  {flyStop?.activity.mediaUrls?.[0] ? (
    <Image source={{ uri: flyStop.activity.mediaUrls[0] }} style={styles.flyThumb} />
  ) : flyStop ? (
    <TypeIconBubble type={flyStop.activity.type} />
  ) : null}
  <View style={styles.flyStopText}>
    <Text style={[styles.flyEyebrow, { color: colors.text.secondary }]}>
      {stopEyebrow(flyDayMeta?.dayNumber ?? flyover.dayIndex + 1, dateLabel, Math.max(0, flyover.stopIndex), flyDay.stops.length)}
    </Text>
    <Text style={[styles.flyTitle, { color: colors.text.primary }]} numberOfLines={1}>
      {flyStop ? (flyStop.activity.placeName || flyStop.activity.title) : ' '}
    </Text>
    {flyStop?.activity.startTime || flyStop?.activity.notes ? (
      <Text style={[styles.flyMeta, { color: colors.text.secondary }]} numberOfLines={2}>
        {[flyStop.activity.startTime, flyStop.activity.notes].filter(Boolean).join(' · ')}
      </Text>
    ) : null}
  </View>
</View>
```

Styles: `flyStopRow: { flexDirection: 'row', gap: Spacing['3'], alignItems: 'center' }`, `flyStopText: { flex: 1 }`, `flyThumb: { width: 56, height: 56, borderRadius: 12 }`, `flyMeta: { fontSize: 13, marginTop: 2 }`. Check `TypeIconBubble`'s props in `components/ui/TypeIconBubble.tsx` and pass what it takes. `mediaUrls` are the traveler's own photos; this adds no API call.

- [ ] **Step 4: Run tests and type-check** — `npx jest 2>&1 | grep -E "^Tests:"; npx tsc --noEmit 2>&1 | grep TripMapView; echo done`. Expected: all pass, no tsc lines. Commit: `git commit -am "feat: flyover shows each stop — camera, marker and card"`.

**Globe:**

- [ ] **Step 5: `GlobeMapView` — heat layer under catalog pins**

Replace the `trendingPlaces` prop and `trendingCollection` with `destinations` / `destinationPinFeatures(destinations ?? [])`, and add, before the pin `ShapeSource`:

```tsx
{heat ? (
  <ShapeSource id="heat" shape={heat}>
    <HeatmapLayer
      id="heat"
      maxZoomLevel={10}
      style={{
        heatmapWeight: ['interpolate', ['linear'], ['get', 'w'], 0, 0, 20, 1],
        heatmapIntensity: ['interpolate', ['linear'], ['zoom'], 0, 0.6, 7, 1.6],
        heatmapRadius: ['interpolate', ['linear'], ['zoom'], 0, 6, 4, 18, 7, 30],
        // Fades out as the map closes in, so pins and POIs take over (spec: 7 → 10).
        heatmapOpacity: ['interpolate', ['linear'], ['zoom'], 7, 0.85, 10, 0],
        heatmapColor: [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(76,63,168,0)',
          0.2, 'rgba(76,63,168,0.55)',   // deep violet
          0.5, '#7F77DD',                // brand purple
          0.8, '#D4537E',                // brand pink
          1, '#FDE7B0',                  // pale amber
        ],
      }}
    />
  </ShapeSource>
) : null}
```

Rename the pin layers `destination-halo`, `destination-pin`, `destination-label`, add `circleEmissiveStrength: 1` to both circle layers, and export `export const DESTINATION_PIN_LAYERS = ['destination-pin', 'destination-label'];`. Import `HeatmapLayer` from `@rnmapbox/maps`.

- [ ] **Step 6: `search.tsx` — data, tap → page, eyebrow, search rows**

```tsx
const { destinations } = useDestinations();
const heat = useHeatmap();
// <GlobeMapView … destinations={destinations} heat={heat} />
```

At the top of `handleMapPress`, after the keyboard check and before the POI query:

```tsx
const pinHit = destinationSlugFromFeatures(
  await mapRef.current?.queryRenderedFeaturesInRect(tapBbox(screenPointX, screenPointY), [], DESTINATION_PIN_LAYERS),
);
if (pinHit) {
  router.push(`/destination/${pinHit}`);
  return;
}
```

Eyebrow: `` `TRENDING NOW · ${destinations.length} DESTINATIONS` `` (and the comment there updated: pins now come from the catalog).

Places tab (`renderPlaces`), before the Google list and also when Google returned nothing:

```tsx
const destMatches = matchDestinations(destinations, query);
// …
{destMatches.length > 0 && (
  <>
    <Text style={[styles.sheetHeading, { color: colors.text.tertiary }]}>DESTINATIONS</Text>
    {destMatches.map((d) => <DestinationResult key={d.slug} destination={d} onPress={handleDestinationResult} />)}
  </>
)}
```

with `const handleDestinationResult = useCallback((slug: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/destination/${slug}`); }, [router]);`. The `places.length === 0` "No results" branch only fires when `destMatches` is empty too.

`components/search/DestinationResult.tsx`: a row like `PlaceResult` on the dark sheet (`DarkColors`, this screen is always dark): 44×44 rounded cover thumbnail (or a `MapPin` bubble without one), name (15/500), `destinationEyebrow(d)` (11/500 tracked, muted), `CaretRight` 16; `minHeight: 56`, `accessibilityLabel={`${d.name}, ${d.countryName}`}`; `onPress(d.slug)`.

- [ ] **Step 7: Remove the trip-derived trending code** (`hooks/useTrendingPlaces.ts`, `utils/trendingPlaces.ts`, its test), then run `npx jest 2>&1 | grep -E "^Tests:"; npx tsc --noEmit 2>&1 | head -5; npm run lint 2>&1 | grep -c " error "`. Expected: all tests pass; no tsc output; `0`.

- [ ] **Step 8: Commit**

```bash
git add -A components/search app/\(tabs\)/search.tsx hooks utils __tests__/utils
git commit -m "feat: globe heat map and catalog destination pins; destinations in search"
```

---

### Task 7: Docs, device check, TestFlight build

**Files:**
- Modify: `CLAUDE.md` (hooks table: `useDestinations`/`useDestination`/`useDestinationTrips`, `useHeatmap`; Explore components: `DestinationCard`, `FilterChips` — remove `TrendingCard`; routing tree: `destination/[slug].tsx`; Utils: `utils/destinations.ts`, `utils/heatmap.ts`; flyover line: rests `STOP_DWELL_MS` on each stop; the "`circleEmissiveStrength` on the globe's trending layers is still missing" sentence becomes done)
- Modify: `docs/app-store-1.0.1.md` (add a "What's new in 1.0.1" draft: destinations to explore, a heat map of where travelers go, trip flyovers that stop at each place)

- [ ] **Step 1: Update both docs; commit** (`git commit -am "docs: Explore, destination pages, heat map, flyover stops"`).

- [ ] **Step 2: Simulator pass** (per memory `ios-local-verification`: EAS dev build + idb; shut everything down afterwards per `close-simulator-when-done`). Check: Explore chips filter and spring, Oceania + Nightlife shows the empty state, a destination page opens from the grid, from a globe pin and from search; **Plan my trip here** prefills the AI form; a top place opens the place sheet; the heat map shows at world zoom and fades by zoom 10; a trip flyover rests on each stop with the card showing it. Note anything the simulator can't show (the heatmap and circle layers may need a device — the trip map's `CircleLayer` drew nothing on the simulator before).

- [ ] **Step 3: Final whole-branch review** (executing-plans' fresh reviewer), fix pass, merge `feat/explore-heatmap` to `main`, push.

- [ ] **Step 4: Production build for TestFlight** — `eas build --platform ios --profile production --non-interactive`, then `eas submit --platform ios --latest --non-interactive`; if the submission sits `IN_QUEUE` > 25 min, download the ipa for Transporter as with build 8. The user tests it, then submits 1.0.1 (with the `docs/app-store-1.0.1.md` text pasted into App Store Connect).
