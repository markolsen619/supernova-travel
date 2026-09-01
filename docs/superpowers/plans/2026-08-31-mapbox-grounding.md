# Mapbox-First Activity Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground every AI-generated itinerary stop automatically and accurately, by resolving it against the bounding box of the city its day belongs to — Mapbox first, Google only for the misses.

**Architecture:** Grounding becomes a two-link provider chain behind one function. Mapbox Search Box, constrained by a hard `bbox`, resolves ~90% of stops for free and — critically — returns nothing rather than something wrong when it fails. Google Text Search with `locationBias` catches the rest. A background pass on trip open walks the itinerary so pins appear without the user asking.

**Tech Stack:** TypeScript, React Native (Expo), Firebase Cloud Functions, Mapbox Search Box API, Google Places API (New), Jest.

**Spec:** `docs/superpowers/specs/2026-08-31-mapbox-grounding-design.md` (on branch `docs/mapbox-grounding-spec`)

## Global Constraints

- **Base branch: `feat/onboarding-polish`**, not `main`. It is 80 commits ahead / 0 behind and is the de-facto trunk. Both `services/places/googlePlaces.ts` and `components/trip/TripMapView.tsx` — the two files this plan modifies most — are actively changed there. Branching from `main` guarantees conflicts in exactly those files.
- **Imports use the `@/` path alias** (maps to project root via `tsconfig.json`). Never relative parent paths.
- **No React Native component-testing library exists in this project.** Every test in `__tests__/` is a pure-function test. Push logic into `utils/` and test it there; never add a renderer.
- **Test command:** `npx jest --watchAll=false <path>`. Plain `npm test` runs `jest --watchAll` and will not exit.
- **`TripActivity.startTime` / `endTime` are wall-clock strings** (`"14:30"`), never Timestamps. Do not coerce.
- **Never call a secret-key API from the client.** Mapbox and Google Places browser keys are `EXPO_PUBLIC_*` and already present in `.env.local`; no new configuration is required.
- **Commit trailers** — every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz
  ```
- **`PlaceViewportBounds` corners are `[lng, lat]`**, not `[lat, lng]` — see `services/places/googlePlaces.ts:53`. Mapbox `bbox` order is `west,south,east,north`.

---

## File Structure

| File | Responsibility |
|---|---|
| `utils/placeQuery.ts` (new) | Pure builder for the Google Text Search request body, incl. optional bias |
| `utils/geoBounds.ts` (new) | Pure conversions between `PlaceViewportBounds` and Mapbox `bbox` |
| `utils/mapboxQuery.ts` (new) | Pure Mapbox forward-search URL builder + response normaliser |
| `utils/dayDestination.ts` (new) | Pure day→destination-index resolution (explicit, inferred, fallback) |
| `services/places/mapboxSearch.ts` (new) | Thin Mapbox fetch wrappers over the pure helpers |
| `services/places/groundStop.ts` (new) | The provider chain: Mapbox, then Google |
| `services/places/googlePlaces.ts` | Add bias parameter + cheap grounding field mask |
| `functions/src/generateTrip.ts` | Emit and persist `destinationIndex` per day |
| `app/trip/[id].tsx` | Route grounding through the chain; background auto-grounding pass |
| `components/trip/TripMapView.tsx` | Coordinate-based mappable predicate |
| `types/index.ts` | `Destination.bounds`, `TripDay.destinationIndex`, `TripActivity.groundingFailedAt` |

---

### Task 1: Google location bias and a cheaper grounding field mask

Fixes the wrong-city bug on the existing manual tap-to-locate path. **Ships and is useful entirely on its own** — nothing later depends on it landing first, and nothing here depends on Mapbox.

**Files:**
- Create: `utils/placeQuery.ts`
- Test: `__tests__/utils/placeQuery.test.ts`
- Modify: `services/places/googlePlaces.ts` (`textSearchFirstResult` ~line 137, `enrichPlaceByQuery` ~line 289)

**Interfaces:**
- Consumes: nothing.
- Produces: `buildTextSearchBody(query, bias?, maxResults?)`; `enrichPlaceByQuery(query, bias?)` where `bias` is `{ lat: number; lng: number; radiusM?: number } | null`; exported const `GROUNDING_LIST_FIELD_MASK: string`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/placeQuery.test.ts
import { buildTextSearchBody } from '@/utils/placeQuery';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false __tests__/utils/placeQuery.test.ts`
Expected: FAIL — `Cannot find module '@/utils/placeQuery'`

- [ ] **Step 3: Write the implementation**

```ts
// utils/placeQuery.ts

/** A soft geographic hint for Google Text Search. Google treats this as a
 *  ranking preference, not a restriction — results outside it are still
 *  possible, which is why it is the fallback provider rather than the first. */
export interface PlaceBias {
  lat: number;
  lng: number;
  /** Metres. Google's maximum is 50000; larger values are clamped. */
  radiusM?: number;
}

const DEFAULT_RADIUS_M = 50000;
const MAX_RADIUS_M = 50000;

/** Builds the `places:searchText` request body. Pure so the bias logic —
 *  the part that was missing and caused La Paz BCS trips to resolve stops in
 *  La Paz, Bolivia — is testable without a network call. */
export function buildTextSearchBody(
  query: string,
  bias?: PlaceBias | null,
  maxResults = 1,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    textQuery: query,
    maxResultCount: maxResults,
    languageCode: 'en',
  };
  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: Math.min(MAX_RADIUS_M, Math.max(1, bias.radiusM ?? DEFAULT_RADIUS_M)),
      },
    };
  }
  return body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false __tests__/utils/placeQuery.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Parameterise the field mask on `textSearchFirstResult`**

`textSearchFirstResult` currently hardcodes `TIER2_LIST_FIELD_MASK` at line ~146, which forces every grounding call into the Enterprise + Atmosphere SKU ($40/1,000, 1,000 free) purely to fetch coordinates. Add a mask parameter and a grounding-only mask, in `services/places/googlePlaces.ts`:

```ts
// Alongside TIER2_FIELDS. Grounding needs an identity and a position — nothing
// else. Excluding rating/priceLevel/openingHours/editorialSummary drops the call
// from the Atmosphere SKU to Text Search Pro ($32/1k, 5,000 free vs 1,000).
const GROUNDING_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'addressComponents',
] as const;

export const GROUNDING_LIST_FIELD_MASK = GROUNDING_FIELDS.map((f) => `places.${f}`).join(',');
```

Then change the signature and the header:

```ts
async function textSearchFirstResult(
  body: Record<string, unknown>,
  logLabel: string,
  fieldMask: string = TIER2_LIST_FIELD_MASK,   // default preserves every existing caller
): Promise<RawTier2Place | null> {
  // ...
  'X-Goog-FieldMask': fieldMask,
```

- [ ] **Step 6: Add the bias parameter to `enrichPlaceByQuery`**

Replace the body-literal at `enrichPlaceByQuery` (~line 289) so it uses the builder and the cheap mask:

```ts
export async function enrichPlaceByQuery(
  query: string,
  bias?: PlaceBias | null,
): Promise<EnrichedPlace | null> {
  const place = await textSearchFirstResult(
    buildTextSearchBody(query, bias),
    'enrichPlaceByQuery',
    GROUNDING_LIST_FIELD_MASK,
  );
  // ...rest unchanged
```

Also update the stale doc comment above it: it currently claims "there's no known lat/lng to bias or fall back to", which is what justified the missing bias. Replace with a note that callers pass the destination's centre, and that an unbiased call resolves against the whole planet.

Note the tier: results from this path are no longer `tier2` — they carry no rating/photos. Set `tier: 'tier1'` in the returned object so `usePlacesStore` consumers do not assume sheet-quality fields are present.

- [ ] **Step 7: Verify nothing else broke**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx jest --watchAll=false`
Expected: all suites pass.

- [ ] **Step 8: Commit**

```bash
git add utils/placeQuery.ts __tests__/utils/placeQuery.test.ts services/places/googlePlaces.ts
git commit -m "fix: bias AI stop grounding to the trip's destination

enrichPlaceByQuery ran a global text search with no locationBias, so a
trip to La Paz, Baja California Sur resolved stops in La Paz, Bolivia.
Measured 8/10 correct unbiased vs 10/10 with bias on representative
stop names.

Also drops the grounding call from the Enterprise + Atmosphere field
mask to a grounding-only mask: coordinates no longer cost sheet-quality
data rates (\$32/1k with 5,000 free, vs \$40/1k with 1,000).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 2: Bounding-box conversions

**Files:**
- Create: `utils/geoBounds.ts`
- Test: `__tests__/utils/geoBounds.test.ts`

**Interfaces:**
- Consumes: `PlaceViewportBounds` from `@/services/places/googlePlaces` (`{ ne: [lng, lat]; sw: [lng, lat] }`).
- Produces: `boundsToBbox(bounds): [number, number, number, number] | null` returning `[west, south, east, north]`; `bboxCenter(bbox): { lat: number; lng: number }`; `isBboxUsable(bbox): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/geoBounds.test.ts
import { boundsToBbox, bboxCenter, isBboxUsable } from '@/utils/geoBounds';

const LA_PAZ = { sw: [-110.42, 24.05] as [number, number], ne: [-110.24, 24.22] as [number, number] };

describe('boundsToBbox', () => {
  it('emits west,south,east,north from [lng,lat] corners', () => {
    expect(boundsToBbox(LA_PAZ)).toEqual([-110.42, 24.05, -110.24, 24.22]);
  });

  it('returns null for missing bounds', () => {
    expect(boundsToBbox(null)).toBeNull();
  });

  it('returns null when a corner is malformed', () => {
    expect(boundsToBbox({ sw: [-110.42, 24.05], ne: [NaN, 24.22] } as never)).toBeNull();
  });
});

describe('bboxCenter', () => {
  it('returns the midpoint as lat/lng', () => {
    expect(bboxCenter([-110.42, 24.05, -110.24, 24.22])).toEqual({ lng: -110.33, lat: 24.135 });
  });
});

describe('isBboxUsable', () => {
  it('accepts a city-sized box', () => {
    expect(isBboxUsable([-110.42, 24.05, -110.24, 24.22])).toBe(true);
  });

  it('rejects a degenerate zero-area box', () => {
    expect(isBboxUsable([-110.3, 24.1, -110.3, 24.1])).toBe(false);
  });

  it('rejects an antimeridian-crossing box rather than silently inverting it', () => {
    expect(isBboxUsable([179.5, 24.0, -179.5, 24.5])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false __tests__/utils/geoBounds.test.ts`
Expected: FAIL — `Cannot find module '@/utils/geoBounds'`

- [ ] **Step 3: Write the implementation**

```ts
// utils/geoBounds.ts
import type { PlaceViewportBounds } from '@/services/places/googlePlaces';

/** Mapbox bbox order: west, south, east, north. */
export type Bbox = [number, number, number, number];

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Google viewport corners are [lng, lat] (see viewportToBounds). Returns null
 *  rather than a malformed box — a bad box would silently widen the search
 *  back to global, which is the failure mode this whole design exists to avoid. */
export function boundsToBbox(bounds: PlaceViewportBounds | null | undefined): Bbox | null {
  if (!bounds?.sw || !bounds?.ne) return null;
  const [w, s] = bounds.sw;
  const [e, n] = bounds.ne;
  if (![w, s, e, n].every(finite)) return null;
  return [w, s, e, n];
}

export function bboxCenter(bbox: Bbox): { lat: number; lng: number } {
  const [w, s, e, n] = bbox;
  return { lng: (w + e) / 2, lat: (s + n) / 2 };
}

/** A box must have area and must not wrap the antimeridian. Mapbox rejects
 *  wrapped boxes, and a zero-area box matches nothing. */
export function isBboxUsable(bbox: Bbox | null): boolean {
  if (!bbox) return false;
  const [w, s, e, n] = bbox;
  if (![w, s, e, n].every(finite)) return false;
  return e > w && n > s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false __tests__/utils/geoBounds.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/geoBounds.ts __tests__/utils/geoBounds.test.ts
git commit -m "feat: add bounding-box conversion helpers for Mapbox grounding

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 3: Mapbox forward-search URL builder and response normaliser

Pure logic only. The network wrapper is Task 4.

**Files:**
- Create: `utils/mapboxQuery.ts`
- Test: `__tests__/utils/mapboxQuery.test.ts`

**Interfaces:**
- Consumes: `Bbox` from `@/utils/geoBounds`.
- Produces: `GroundedPlace` interface; `buildMapboxForwardUrl(params): string`; `normalizeMapboxFeature(feature): GroundedPlace | null`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/mapboxQuery.test.ts
import { buildMapboxForwardUrl, normalizeMapboxFeature } from '@/utils/mapboxQuery';

describe('buildMapboxForwardUrl', () => {
  it('includes a hard bbox when given one', () => {
    const url = buildMapboxForwardUrl({
      query: 'Malecón', token: 'tok', bbox: [-110.42, 24.05, -110.24, 24.22],
    });
    expect(url).toContain('bbox=-110.42%2C24.05%2C-110.24%2C24.22');
    expect(url).toContain('q=Malec%C3%B3n');
    expect(url).toContain('limit=1');
  });

  it('omits bbox when none is given', () => {
    const url = buildMapboxForwardUrl({ query: 'Paris', token: 'tok' });
    expect(url).not.toContain('bbox=');
  });

  it('includes proximity and country when given', () => {
    const url = buildMapboxForwardUrl({
      query: 'La Paz', token: 'tok', proximity: { lat: 24.1, lng: -110.3 },
      country: 'mx', types: 'place',
    });
    expect(url).toContain('proximity=-110.3%2C24.1');
    expect(url).toContain('country=mx');
    expect(url).toContain('types=place');
  });
});

describe('normalizeMapboxFeature', () => {
  const feature = {
    geometry: { coordinates: [-110.31, 24.14] },
    properties: {
      name: 'Malecón de La Paz',
      full_address: 'Malecón, La Paz, BCS, Mexico',
      mapbox_id: 'dXJuOm1i',
      context: { country: { country_code: 'MX' } },
    },
  };

  it('maps a feature to a GroundedPlace with source mapbox', () => {
    expect(normalizeMapboxFeature(feature)).toEqual({
      name: 'Malecón de La Paz',
      lat: 24.14,
      lng: -110.31,
      address: 'Malecón, La Paz, BCS, Mexico',
      countryCode: 'MX',
      source: 'mapbox',
      placeId: null,
      mapboxId: 'dXJuOm1i',
    });
  });

  it('returns null when coordinates are missing', () => {
    expect(normalizeMapboxFeature({ properties: { name: 'x' } } as never)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeMapboxFeature(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false __tests__/utils/mapboxQuery.test.ts`
Expected: FAIL — `Cannot find module '@/utils/mapboxQuery'`

- [ ] **Step 3: Write the implementation**

```ts
// utils/mapboxQuery.ts
import type { Bbox } from '@/utils/geoBounds';

/** Provider-neutral result of grounding one stop. `placeId` is populated only
 *  by the Google fallback; a Mapbox-grounded stop has coordinates and no Google
 *  identity, which is exactly the "grounded but not enriched" state the map
 *  renders and enrichPoiByNameAndCoords later upgrades on demand. */
export interface GroundedPlace {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  countryCode: string | null;
  source: 'mapbox' | 'google';
  placeId: string | null;
  mapboxId: string | null;
}

export interface MapboxForwardParams {
  query: string;
  token: string;
  /** Hard restriction. Unlike `proximity`, results outside it are excluded —
   *  this is what turns a wrong answer into an honest miss. */
  bbox?: Bbox | null;
  proximity?: { lat: number; lng: number } | null;
  country?: string | null;
  types?: string | null;
  limit?: number;
}

const FORWARD_ENDPOINT = 'https://api.mapbox.com/search/searchbox/v1/forward';

export function buildMapboxForwardUrl(p: MapboxForwardParams): string {
  const qs = new URLSearchParams({
    q: p.query,
    access_token: p.token,
    limit: String(p.limit ?? 1),
    language: 'en',
  });
  if (p.bbox) qs.set('bbox', p.bbox.join(','));
  if (p.proximity) qs.set('proximity', `${p.proximity.lng},${p.proximity.lat}`);
  if (p.country) qs.set('country', p.country.toLowerCase());
  if (p.types) qs.set('types', p.types);
  return `${FORWARD_ENDPOINT}?${qs.toString()}`;
}

interface MapboxFeatureLike {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    full_address?: string;
    mapbox_id?: string;
    context?: { country?: { country_code?: string } };
  };
}

export function normalizeMapboxFeature(f: MapboxFeatureLike | undefined | null): GroundedPlace | null {
  const coords = f?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    name: f?.properties?.name ?? '',
    lat,
    lng,
    address: f?.properties?.full_address ?? null,
    countryCode: f?.properties?.context?.country?.country_code?.toUpperCase() ?? null,
    source: 'mapbox',
    placeId: null,
    mapboxId: f?.properties?.mapbox_id ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false __tests__/utils/mapboxQuery.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/mapboxQuery.ts __tests__/utils/mapboxQuery.test.ts
git commit -m "feat: add Mapbox forward-search URL builder and normaliser

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 4: Mapbox search service

**Files:**
- Create: `services/places/mapboxSearch.ts`

**Interfaces:**
- Consumes: `buildMapboxForwardUrl`, `normalizeMapboxFeature`, `GroundedPlace` (Task 3); `Bbox`, `boundsToBbox`, `isBboxUsable` (Task 2).
- Produces: `searchPlaceInBounds(query, bbox, center?): Promise<GroundedPlace | null>`; `resolveCityBounds(name, countryCode): Promise<PlaceViewportBounds | null>`.

No unit test: this file is a thin fetch wrapper with all logic already tested in Tasks 2–3. Follow the existing `googlePlaces.ts` error posture — log and return null, never throw.

- [ ] **Step 1: Write the implementation**

```ts
// services/places/mapboxSearch.ts
import { buildMapboxForwardUrl, normalizeMapboxFeature, type GroundedPlace } from '@/utils/mapboxQuery';
import { isBboxUsable, type Bbox } from '@/utils/geoBounds';
import type { PlaceViewportBounds } from '@/services/places/googlePlaces';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

/**
 * Grounds one AI-authored searchQuery inside a hard bounding box.
 *
 * Returns null on no match — deliberately. Measured against representative
 * stop names, Mapbox with a soft `proximity` hint alone returned results
 * 5,000-8,000km away (a Peruvian museum for a Mexican one); with a hard `bbox`
 * it returned zero wrong answers and one honest miss. Callers must treat null
 * as "ask Google", never as "no such place".
 */
export async function searchPlaceInBounds(
  query: string,
  bbox: Bbox | null,
  center?: { lat: number; lng: number } | null,
): Promise<GroundedPlace | null> {
  if (!TOKEN || !query.trim()) return null;
  if (!isBboxUsable(bbox)) return null;
  try {
    const res = await fetch(buildMapboxForwardUrl({
      query, token: TOKEN, bbox, proximity: center ?? null, limit: 1,
    }));
    if (!res.ok) {
      console.error('[searchPlaceInBounds] HTTP', res.status);
      return null;
    }
    const json = (await res.json()) as { features?: unknown[] };
    return normalizeMapboxFeature(json.features?.[0] as never);
  } catch (error) {
    console.error('[searchPlaceInBounds] failed', error);
    return null;
  }
}

/**
 * Resolves a destination city to its bounding box.
 *
 * A city name plus a country filter is the unambiguous case for a geocoder:
 * "La Paz" + MX lands in Baja California Sur, not Bolivia. Free on the Search
 * Box tier, so every destination box costs nothing to obtain.
 */
export async function resolveCityBounds(
  name: string,
  countryCode: string | null,
): Promise<PlaceViewportBounds | null> {
  if (!TOKEN || !name.trim()) return null;
  try {
    const res = await fetch(buildMapboxForwardUrl({
      query: name, token: TOKEN, country: countryCode, types: 'place', limit: 1,
    }));
    if (!res.ok) {
      console.error('[resolveCityBounds] HTTP', res.status);
      return null;
    }
    const json = (await res.json()) as { features?: { properties?: { bbox?: number[] } }[] };
    const bbox = json.features?.[0]?.properties?.bbox;
    if (!bbox || bbox.length < 4) return null;
    const [w, s, e, n] = bbox;
    return { sw: [w, s], ne: [e, n] };
  } catch (error) {
    console.error('[resolveCityBounds] failed', error);
    return null;
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add services/places/mapboxSearch.ts
git commit -m "feat: add Mapbox search service for bounded stop grounding

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 5: The provider chain

**Files:**
- Create: `services/places/groundStop.ts`
- Test: `__tests__/services/groundStop.test.ts`

**Interfaces:**
- Consumes: `GroundedPlace` (Task 3); `searchPlaceInBounds` (Task 4); `enrichPlaceByQuery`, `PlaceBias` (Task 1).
- Produces: `groundStop(query, ctx, providers?): Promise<GroundedPlace | null>` where `ctx` is `{ bbox: Bbox | null; center: { lat: number; lng: number } | null }`. The optional third parameter injects providers so the ordering logic is testable without network access.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/services/groundStop.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false __tests__/services/groundStop.test.ts`
Expected: FAIL — `Cannot find module '@/services/places/groundStop'`

- [ ] **Step 3: Write the implementation**

```ts
// services/places/groundStop.ts
import { searchPlaceInBounds } from '@/services/places/mapboxSearch';
import { enrichPlaceByQuery } from '@/services/places/googlePlaces';
import { isBboxUsable, type Bbox } from '@/utils/geoBounds';
import type { GroundedPlace } from '@/utils/mapboxQuery';
import type { PlaceBias } from '@/utils/placeQuery';

export interface GroundingContext {
  bbox: Bbox | null;
  center: { lat: number; lng: number } | null;
}

export interface GroundingProviders {
  mapbox: (q: string, bbox: Bbox | null, center: { lat: number; lng: number } | null) => Promise<GroundedPlace | null>;
  google: (q: string, bias: PlaceBias | null) => Promise<{
    placeId: string; name: string; address: string; lat: number; lng: number; countryCode: string | null;
  } | null>;
}

const DEFAULT_PROVIDERS: GroundingProviders = {
  mapbox: searchPlaceInBounds,
  google: (q, bias) => enrichPlaceByQuery(q, bias),
};

/**
 * Grounds one stop: Mapbox inside a hard box first, Google with a soft bias
 * second.
 *
 * The order is not about quality — Google is more accurate — it is about cost
 * and failure shape. Mapbox is free within the box and cannot answer with a
 * far-away wrong place; Google costs per call but resolves what Mapbox cannot
 * see. Roughly 90% of stops never reach the second link.
 */
export async function groundStop(
  query: string,
  ctx: GroundingContext,
  providers: GroundingProviders = DEFAULT_PROVIDERS,
): Promise<GroundedPlace | null> {
  if (!query.trim()) return null;

  if (isBboxUsable(ctx.bbox)) {
    const hit = await providers.mapbox(query, ctx.bbox, ctx.center);
    if (hit) return hit;
  }

  const g = await providers.google(query, ctx.center);
  if (!g) return null;

  return {
    name: g.name,
    lat: g.lat,
    lng: g.lng,
    address: g.address || null,
    countryCode: g.countryCode,
    source: 'google',
    placeId: g.placeId,
    mapboxId: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false __tests__/services/groundStop.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add services/places/groundStop.ts __tests__/services/groundStop.test.ts
git commit -m "feat: add Mapbox-first grounding chain with Google fallback

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 6: Day-to-destination resolution

The spec calls this out explicitly: the inference path serves **every AI trip generated before this change**, so it needs real coverage rather than being treated as a safety net nobody exercises.

**Files:**
- Create: `utils/dayDestination.ts`
- Test: `__tests__/utils/dayDestination.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveDayDestinationIndices(days, destinationNames): number[]` — one index per day, same order, always within `[0, destinationNames.length - 1]`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/dayDestination.test.ts
import { resolveDayDestinationIndices } from '@/utils/dayDestination';

const CITIES = ['Paris', 'Rome', 'Barcelona'];
const day = (over: Partial<{ destinationIndex: number | null; activities: { type: string; title: string }[] }> = {}) => ({
  destinationIndex: null, activities: [], ...over,
});

describe('resolveDayDestinationIndices', () => {
  it('uses explicit destinationIndex when every day has a valid one', () => {
    const days = [day({ destinationIndex: 0 }), day({ destinationIndex: 1 }), day({ destinationIndex: 2 })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 1, 2]);
  });

  it('infers from transport markers when the explicit field is absent', () => {
    const days = [
      day(),
      day({ activities: [{ type: 'transport', title: 'Travel from Paris to Rome' }] }),
      day(),
      day({ activities: [{ type: 'transport', title: 'Travel from Rome to Barcelona' }] }),
    ];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 1, 1, 2]);
  });

  it('matches the arrival city case-insensitively', () => {
    const days = [day(), day({ activities: [{ type: 'transport', title: 'travel from paris to ROME' }] })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 1]);
  });

  it('ignores a transport activity that names no known city', () => {
    const days = [day(), day({ activities: [{ type: 'transport', title: 'Travel to the airport' }] })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 0]);
  });

  it('falls back to index 0 for a single-destination trip with no markers', () => {
    expect(resolveDayDestinationIndices([day(), day()], ['La Paz'])).toEqual([0, 0]);
  });

  it('clamps an out-of-range explicit index rather than trusting it', () => {
    const days = [day({ destinationIndex: 7 })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0]);
  });

  it('returns an empty array for no days', () => {
    expect(resolveDayDestinationIndices([], CITIES)).toEqual([]);
  });

  it('returns all zeros when the destination list is empty', () => {
    expect(resolveDayDestinationIndices([day(), day()], [])).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false __tests__/utils/dayDestination.test.ts`
Expected: FAIL — `Cannot find module '@/utils/dayDestination'`

- [ ] **Step 3: Write the implementation**

```ts
// utils/dayDestination.ts

export interface DayLike {
  destinationIndex?: number | null;
  activities: { type: string; title: string }[];
}

/** "Travel from Paris to Rome" -> "Rome". The multi-city prompt mandates this
 *  exact shape on the first day at each new city (generateTrip.ts). */
const TRAVEL_TO = /\bto\s+(.+)$/i;

/**
 * Maps each day to the index of the destination it takes place in.
 *
 * Three tiers, in order:
 *  1. Gemini's explicit `destinationIndex`, when every day carries a valid one.
 *  2. Inference from the mandated "Travel from X to Y" transport markers —
 *     this path serves every trip generated before destinationIndex existed,
 *     and Gemini's output is not schema-enforced, so it is not optional.
 *  3. Index 0. Deliberately the main destination rather than a union of all
 *     boxes: constraining a Rome day to the Paris box makes Mapbox return
 *     nothing, which hands the stop to Google's soft bias and still resolves
 *     correctly. A union box would instead return a confident wrong answer.
 */
export function resolveDayDestinationIndices(days: DayLike[], destinationNames: string[]): number[] {
  if (days.length === 0) return [];
  const max = Math.max(0, destinationNames.length - 1);
  const inRange = (n: number) => n >= 0 && n <= max;

  const explicit = days.map((d) => d.destinationIndex);
  if (explicit.every((n): n is number => typeof n === 'number' && inRange(n))) {
    return explicit as number[];
  }

  const lower = destinationNames.map((n) => n.toLowerCase());
  const result: number[] = [];
  let current = 0;

  for (const d of days) {
    for (const act of d.activities) {
      if (act.type !== 'transport') continue;
      const arrival = TRAVEL_TO.exec(act.title ?? '')?.[1]?.trim().toLowerCase();
      if (!arrival) continue;
      const found = lower.findIndex((city) => arrival.includes(city));
      if (found >= 0) {
        current = found;
        break;
      }
    }
    result.push(inRange(current) ? current : 0);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false __tests__/utils/dayDestination.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/dayDestination.ts __tests__/utils/dayDestination.test.ts
git commit -m "feat: resolve each itinerary day to its destination city

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 7: Persist `destinationIndex` from generation

**Files:**
- Modify: `functions/src/generateTrip.ts` (`buildMultiCityPrompt` ~line 231, day write ~line 99)
- Modify: `functions/src/types.ts`
- Modify: `types/index.ts` (`TripDay`)

**Interfaces:**
- Consumes: nothing.
- Produces: `TripDay.destinationIndex: number | null` on every newly generated day.

- [ ] **Step 1: Add the field to the multi-city prompt's JSON spec**

In `buildMultiCityPrompt`, inside the `days` array object in the "Return ONLY valid JSON" block, add `destinationIndex` immediately after `dayNumber`:

```
    {
      "dayNumber": 1,
      "destinationIndex": 0,
      "title": "Day theme title",
```

- [ ] **Step 2: Add the accompanying rule**

In the same function's `Rules:` list, add:

```
- destinationIndex is the 0-based index of which destination from the numbered list above this day takes place in — it must be non-decreasing across days, matching the requirement that destinations are visited strictly in the order listed
```

Leave `buildPrompt` (single-city) untouched: its index is always 0, and adding a field there is noise the model can get wrong.

- [ ] **Step 3: Widen the generated type**

In `functions/src/types.ts`, add to the generated day interface:

```ts
  /** 0-based index into the destination list. Absent on single-city trips and
   *  on every trip generated before this field existed — the client infers it
   *  from transport markers in that case (utils/dayDestination.ts). */
  destinationIndex?: number | null;
```

- [ ] **Step 4: Persist it**

In the day write (`generateTrip.ts` ~line 99), add to the `batch.set(dayRef, { ... })` object:

```ts
        destinationIndex: typeof day.destinationIndex === 'number' ? day.destinationIndex : null,
```

Gemini output is a raw `JSON.parse` with no schema enforcement (line 57), so the typeof guard is load-bearing, not defensive decoration.

- [ ] **Step 5: Mirror the field on the client type**

In `types/index.ts`, add to `TripDay`:

```ts
  /** Which destination this day belongs to, for multi-city trips. Null on
   *  older trips; resolveDayDestinationIndices() infers those. */
  destinationIndex: number | null;
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `cd functions && npm run build`
Expected: compiles with no errors.

- [ ] **Step 7: Commit**

```bash
git add functions/src/generateTrip.ts functions/src/types.ts types/index.ts
git commit -m "feat: emit destinationIndex per day for multi-city itineraries

Multi-country trips need each day resolved against its own city's bounding
box; a union box across countries returns confident wrong answers for
generic names like 'Centraal Station' or 'Duomo'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 8: Destination bounds on the trip

**Files:**
- Modify: `types/index.ts` (`Destination`, `UpdateTripInput`)
- Modify: `hooks/useTripCoverResolver.ts`

**Interfaces:**
- Consumes: `resolveCityBounds` (Task 4); `boundsToBbox` (Task 2).
- Produces: `Destination.bounds: PlaceViewportBounds | null`, persisted on the trip document.

- [ ] **Step 1: Add the field to the type**

In `types/index.ts`:

```ts
export interface Destination {
  name: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  /** Bounding box used to constrain stop grounding to this city. Resolved once
   *  and persisted; null until then, and for trips created before this field. */
  bounds: PlaceViewportBounds | null;
}
```

Import `PlaceViewportBounds` from `@/services/places/googlePlaces`. Every construction site of `Destination` must now supply `bounds` — `npx tsc --noEmit` will enumerate them; set `bounds: null` at each.

- [ ] **Step 2: Backfill bounds alongside the existing cover resolution**

`useTripCoverResolver` already grounds an AI trip's destination once, ever, and persists the result. Extend that same pass so it also resolves and persists the box — no additional user-visible work and no extra Google call, because `resolveCityBounds` uses Mapbox and is free:

```ts
// inside the existing owner-only, once-ever resolve path, after the
// destination has been grounded:
if (!trip.destination.bounds) {
  const bounds = await resolveCityBounds(trip.destination.name, trip.destination.countryCode);
  if (bounds) {
    await updateTrip(trip.id, {
      destination: { ...trip.destination, bounds },
    });
  }
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0 (after every `Destination` literal has `bounds`).

Run: `npx jest --watchAll=false`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts hooks/useTripCoverResolver.ts
git commit -m "feat: persist a bounding box on each trip destination

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 9: Coordinate-based mappable predicate

Without this, every Mapbox-grounded stop has valid coordinates and still renders no pin.

**Files:**
- Modify: `components/trip/TripMapView.tsx` (~line 72)
- Modify: `types/index.ts` (`TripActivity.groundingFailedAt`)

**Interfaces:**
- Consumes: nothing.
- Produces: a stop is mappable when `lat != null && lng != null`, regardless of `placeId`.

- [ ] **Step 1: Change the predicate**

At `TripMapView.tsx:72`, replace:

```ts
if (activity.placeId && activity.lat != null && activity.lng != null) {
```

with:

```ts
// Grounded means "has coordinates", not "has a Google placeId". Mapbox-grounded
// stops carry coordinates and no Google identity; they are pinnable now and
// upgrade to a full Google place via enrichPoiByNameAndCoords only if the user
// opens one. Gating on placeId here would hide every Mapbox-grounded pin.
if (activity.lat != null && activity.lng != null) {
```

Then check the `else if (!activity.placeId && activity.searchQuery)` branch immediately below: its condition must become `else if (activity.searchQuery)` so a coordinate-less stop still qualifies for "Locate all".

- [ ] **Step 2: Add the failure marker to the type**

In `types/index.ts`, add to `TripActivity`:

```ts
  /** Set when both providers failed to ground this stop. Prevents the
   *  automatic pass from re-billing an unresolvable stop on every trip open —
   *  the previous in-memory set died on unmount, which was harmless only while
   *  grounding was user-initiated. */
  groundingFailedAt: Timestamp | null;
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/trip/TripMapView.tsx types/index.ts
git commit -m "fix: pin any stop with coordinates, not only Google-identified ones

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

### Task 10: Background auto-grounding on trip open

**Files:**
- Modify: `app/trip/[id].tsx` (`handleGroundActivity` ~line 345)
- Create: `utils/groundingQueue.ts`
- Test: `__tests__/utils/groundingQueue.test.ts`

**Interfaces:**
- Consumes: `groundStop` (Task 5); `resolveDayDestinationIndices` (Task 6); `boundsToBbox`, `bboxCenter` (Task 2).
- Produces: `selectStopsToGround(days, destinationIndices): { activityId, dayId, searchQuery, destinationIndex }[]` — deduplicated, already-grounded and already-failed stops removed.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/groundingQueue.test.ts
import { selectStopsToGround } from '@/utils/groundingQueue';

const act = (over: any = {}) => ({
  id: 'a1', lat: null, lng: null, searchQuery: 'Malecón', groundingFailedAt: null, ...over,
});

describe('selectStopsToGround', () => {
  it('selects ungrounded stops that have a searchQuery', () => {
    const days = [{ id: 'd1', activities: [act()] }];
    expect(selectStopsToGround(days, [0])).toEqual([
      { activityId: 'a1', dayId: 'd1', searchQuery: 'Malecón', destinationIndex: 0 },
    ]);
  });

  it('skips stops that already have coordinates', () => {
    const days = [{ id: 'd1', activities: [act({ lat: 24.1, lng: -110.3 })] }];
    expect(selectStopsToGround(days, [0])).toEqual([]);
  });

  it('skips stops already marked as grounding-failed', () => {
    const days = [{ id: 'd1', activities: [act({ groundingFailedAt: { seconds: 1 } })] }];
    expect(selectStopsToGround(days, [0])).toEqual([]);
  });

  it('skips stops with no searchQuery', () => {
    const days = [{ id: 'd1', activities: [act({ searchQuery: '' })] }];
    expect(selectStopsToGround(days, [0])).toEqual([]);
  });

  it('deduplicates repeated queries within the same destination', () => {
    const days = [{ id: 'd1', activities: [act({ id: 'a1' }), act({ id: 'a2' })] }];
    expect(selectStopsToGround(days, [0])).toHaveLength(1);
  });

  it('does not deduplicate the same query across different destinations', () => {
    const days = [
      { id: 'd1', activities: [act({ id: 'a1', searchQuery: 'Central Station' })] },
      { id: 'd2', activities: [act({ id: 'a2', searchQuery: 'Central Station' })] },
    ];
    expect(selectStopsToGround(days, [0, 1])).toHaveLength(2);
  });

  it('carries each day\'s destination index onto its stops', () => {
    const days = [
      { id: 'd1', activities: [act({ id: 'a1' })] },
      { id: 'd2', activities: [act({ id: 'a2', searchQuery: 'Colosseum' })] },
    ];
    expect(selectStopsToGround(days, [0, 1]).map((s) => s.destinationIndex)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false __tests__/utils/groundingQueue.test.ts`
Expected: FAIL — `Cannot find module '@/utils/groundingQueue'`

- [ ] **Step 3: Write the implementation**

```ts
// utils/groundingQueue.ts

export interface QueueActivity {
  id: string;
  lat: number | null;
  lng: number | null;
  searchQuery?: string | null;
  groundingFailedAt?: unknown;
}

export interface QueueDay {
  id: string;
  activities: QueueActivity[];
}

export interface StopToGround {
  activityId: string;
  dayId: string;
  searchQuery: string;
  destinationIndex: number;
}

const normalise = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Picks which stops the background pass should ground.
 *
 * Every exclusion here is a billed call avoided. Deduplication is keyed by
 * query *and* destination: itineraries repeat anchors within a city (a hotel,
 * a central plaza), but "Central Station" in Paris and in Rome are different
 * places and must not collapse into one.
 */
export function selectStopsToGround(days: QueueDay[], destinationIndices: number[]): StopToGround[] {
  const seen = new Set<string>();
  const out: StopToGround[] = [];

  days.forEach((day, i) => {
    const destinationIndex = destinationIndices[i] ?? 0;
    for (const a of day.activities) {
      if (a.lat != null && a.lng != null) continue;
      if (a.groundingFailedAt) continue;
      const q = (a.searchQuery ?? '').trim();
      if (!q) continue;
      const key = `${destinationIndex}::${normalise(q)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ activityId: a.id, dayId: day.id, searchQuery: q, destinationIndex });
    }
  });

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false __tests__/utils/groundingQueue.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Route `handleGroundActivity` through the chain**

In `app/trip/[id].tsx`, replace the direct `enrichPlaceByQuery(activity.searchQuery)` call (~line 352) with `groundStop`, passing the box for that activity's day. On a null result, persist `groundingFailedAt: serverTimestamp()` via `updateActivity` instead of only adding to the in-memory `unresolvedActivityIds` set.

Keep `setPlace(resolved)` only when `resolved.source === 'google'` — a Mapbox result has no Google `placeId` and would poison the place cache that the search screen reads.

- [ ] **Step 6: Add the background pass**

Add an effect that runs once per trip open, for AI-generated trips where the viewer is the owner:

```ts
useEffect(() => {
  if (!trip?.isAiGenerated || !isOwner) return;
  let cancelled = false;

  (async () => {
    const names = [trip.destination.name, ...trip.additionalDestinations.map((d) => d.name)];
    const indices = resolveDayDestinationIndices(trip.days, names);
    const queue = selectStopsToGround(trip.days, indices);

    for (const stop of queue) {
      if (cancelled) return;
      const dest = stop.destinationIndex === 0
        ? trip.destination
        : trip.additionalDestinations[stop.destinationIndex - 1] ?? trip.destination;
      const bbox = boundsToBbox(dest.bounds);
      await groundOneStop(stop, { bbox, center: bbox ? bboxCenter(bbox) : null });
    }
  })();

  return () => { cancelled = true; };
}, [trip?.id, isOwner]);
```

Run stops sequentially. This is a background pass with no user waiting on it, and serial execution keeps the request rate low and the code obvious.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx jest --watchAll=false`
Expected: all suites pass.

- [ ] **Step 8: Verify in the running app**

Generate a trip for "La Paz" with country Mexico. Open it. Expected: pins appear progressively without pressing "Locate all", and every pin sits in Baja California Sur — none in Bolivia. Confirm with a screenshot of the trip map.

- [ ] **Step 9: Commit**

```bash
git add app/trip/\[id\].tsx utils/groundingQueue.ts __tests__/utils/groundingQueue.test.ts
git commit -m "feat: ground AI itinerary stops automatically on trip open

A generated trip previously opened to an empty map and asked the user to
press 'Locate all' to find their own itinerary. Stops now ground in the
background against their day's destination box.

Failed stops persist a groundingFailedAt marker so the pass cannot
re-bill an unresolvable stop on every subsequent open.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HNsYtAq9okkGSuadUfkKnz"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: location bias and the cheap mask (Task 1), `mapboxSearch.ts` (Tasks 3–4), the provider chain (Task 5), destination bounds (Task 8), per-day assignment including all three tiers (Tasks 6–7), the grounded/enriched split and mappable predicate (Task 9), the background pass, dedupe, and persisted failure marker (Task 10). The spec's "Out of Scope" list is untouched by every task.

**Placeholder scan.** No TBD/TODO, no "add error handling", no "similar to Task N". Every code step carries real code.

**Type consistency.** `GroundedPlace` is defined once in `utils/mapboxQuery.ts` (Task 3) and consumed unchanged by Tasks 4, 5, and 10. `Bbox` is defined in `utils/geoBounds.ts` (Task 2) and used by Tasks 3, 4, 5, 10. `PlaceBias` is defined in `utils/placeQuery.ts` (Task 1) and consumed by Task 5. `resolveDayDestinationIndices` and `selectStopsToGround` keep their names across Tasks 6, 10.

**Known gap carried from the spec.** The Mapbox storage-licensing question is unresolved: temporary geocoding forbids persisting results, and this plan persists coordinates to Firestore. If Search Box results turn out not to be persistable under the free tier, Task 4's `searchPlaceInBounds` must move to the Permanent Geocoding endpoint (~$0.125/trip, still an ~87% saving). That changes one function, not the architecture — but it should be settled with Mapbox before Task 10 ships to users.
