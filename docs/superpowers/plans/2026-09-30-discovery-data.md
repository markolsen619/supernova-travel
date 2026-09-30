# Discovery Data (Catalog, Editorial Trips, Aggregates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill Supernova with ~60 real destinations, each with 2–3 editorial AI itineraries whose stops are on the map, and keep per-destination "places to go" plus a world/community heat-map point set up to date on the server.

**Architecture:** A reviewed catalog (`data/destinations.json`) is the source of truth. A one-off, idempotent Node seed script (Admin SDK, run by hand) creates the editorial account, resolves each destination's centre and box with Mapbox, fetches one cover photo, generates itineraries with the *same* prompt and trip writer `generateTrip` uses, and grounds every stop server-side. Two new Cloud Functions keep it alive: `tagTripDestinations` (Firestore trigger) tags any public trip with the catalog destinations it visits; `aggregateDiscovery` (daily) writes `topPlaces` per destination and `aggregates/heatmap`. All decisions live in pure modules under `functions/src` with Jest tests.

**Tech Stack:** Node 22, firebase-admin 12.7, Firebase Functions v2 (`onDocumentWritten`, `onSchedule`), `@google/generative-ai` (gemini-2.5-flash), Mapbox Search Box API, Google Places API (New), Jest.

**Spec:** `docs/superpowers/specs/2026-09-30-discovery-and-trip-map-design.md` — Part 2.

## Deviations from the spec (decided while planning)

- **No coordinates in `data/destinations.json`.** The spec lists `center`/`bbox` in the catalog; hand-typed boxes for 60 places are an error source. The seed script resolves each destination once with Mapbox (`query` field) and stores `center`/`bbox` on `destinations/{slug}`. The JSON stays the reviewed source for everything else.
- **Heat points are stored flattened** (`points: [lng, lat, w, lng, lat, w, …]`, `stride: 3`). The spec says `[lng, lat, weight][]`, but Firestore rejects nested arrays. Part 3's `useHeatmap` un-flattens.

## Global Constraints

- Credentials never enter the repo: Admin key at `~/.config/supernova/service-account.json`; `GEMINI_API_KEY` from `functions/.env`; `EXPO_PUBLIC_MAPBOX_TOKEN` and `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` from `.env.local`. The script reads them at run time and prints none of them.
- Deploy only the new functions: `firebase deploy --only functions:tagTripDestinations,functions:aggregateDiscovery` (plus rules/indexes). Never a bare `--only functions`.
- Editorial trips are real public trips: `visibility: 'public'`, `isEditorial: true`, `authorUid` = the editorial account, `destinationKeys: [slug]`.
- The seed script is idempotent: re-running skips finished work and only fills gaps. It stops on nothing — a failed destination is reported and skipped.
- Cost ceiling per full run: ≤ 3 itineraries × 60 destinations of Gemini, 60 cover Text Searches, Google grounding only when Mapbox misses. `--limit N` and `--only slug` exist so a trial can cost cents.
- `aggregates/heatmap.points` ≤ 4,000 entries, coordinates rounded to 4 dp.
- Firestore rules: `destinations/*` and `aggregates/*` readable by signed-in users, writable by nobody (Admin SDK bypasses rules).
- Pure modules under `functions/src` import no firebase-admin, so `__tests__/functions/*` can test them (existing pattern: `quotaUtils`, `promptRules`).
- Commit messages end with the two attribution lines used on this branch.

## Review Focus

1. **A public trip whose destination sits in two overlapping catalog boxes** (e.g. "Florence" inside a "Tuscany" box) — it gets both keys; neither destination page is starved.
2. **A trip edited from public to private** — `tagTripDestinations` must not leave it listed; aggregation must skip non-public trips even if they still carry `destinationKeys`.
3. **The trigger re-firing on its own write** — writing `destinationKeys` triggers the function again; it must compare and do nothing, never loop.
4. **Gemini returning fenced JSON, or JSON with a missing field** — the seed script skips that itinerary with a message, never writes a half trip.
5. **Re-running the seed after a crash half-way through a destination** — no duplicate editorial trips (count existing by `destinationKeys` + `isEditorial`).

Items 1, 3, 4 are pinned by tests in Tasks 1 and 3; 2 by a test in Task 3 (`isAggregatable`); 5 by the script's per-destination count check (Task 5 Step 2) and a dry run.

---

## File structure

- Create `functions/src/tripDocs.ts` — pure: `parseGeneratedTrip(text)`, `tripDocuments(uid, data, generated, now)`. `generateTrip.ts` switches to it.
- Create `data/destinations.json` — the reviewed catalog (no coordinates; resolved by the script).
- Create `functions/src/catalog.ts` — pure: types, `validateCatalog`.
- Create `functions/src/discovery.ts` — pure: `destinationKeysFor`, `isAggregatable`, `rankTopPlaces`, `baselinePoints`, `buildHeatPoints`.
- Create `functions/src/discoveryFunctions.ts` — `tagTripDestinations`, `aggregateDiscovery`; export from `functions/src/index.ts`.
- Create `functions/src/seedSupport.ts` — pure: Mapbox/Google URL builders and response parsers used by the script.
- Create `scripts/seed-destinations.mjs` — the runner.
- Modify `firestore.rules`, `firestore.indexes.json`, `CLAUDE.md`.
- Tests: `__tests__/functions/tripDocs.test.ts`, `catalog.test.ts`, `discovery.test.ts`, `seedSupport.test.ts`.

---

### Task 1: Shared trip writer (`functions/src/tripDocs.ts`)

**Files:** Create `functions/src/tripDocs.ts`; modify `functions/src/generateTrip.ts:78-176`; test `__tests__/functions/tripDocs.test.ts`.

**Interfaces — Produces:**
- `parseGeneratedTrip(text: string): GeneratedTrip | null` — strips ```json fences; null when not JSON or missing `title`/`days[]`.
- `tripDocuments(uid: string, data: GenerateTripRequest, generated: GeneratedTrip, now: unknown, extra?: Record<string, unknown>): { trip: Record<string, unknown>; days: { day: Record<string, unknown>; activities: Record<string, unknown>[] }[] }` — exactly the fields `generateTrip` writes today; `now` is passed in (serverTimestamp in production, a sentinel in tests); `extra` merges into the trip (the seed passes `isEditorial`, `destinationKeys`, `coverImageUrl`, `destination`).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/functions/tripDocs.test.ts
// Relative path: functions/ is a separate package; tripDocs imports no firebase-admin.
import { parseGeneratedTrip, tripDocuments } from '../../functions/src/tripDocs';

const generated = {
  title: 'Lisbon in Three Days',
  description: 'Hills, trams and tiles.',
  days: [
    {
      dayNumber: 1, title: 'Alfama', notes: 'Start slow',
      activities: [
        { type: 'hotel', title: 'Check into Memmo Alfama', address: null, rationale: 'Central', searchQuery: 'Memmo Alfama, Lisbon', startTime: '15:00', endTime: null, notes: 'Views', cost: null, currency: null },
      ],
    },
  ],
};
const request = {
  destination: 'Lisbon', countryCode: 'PT', additionalDestinations: [], startDate: null, endDate: null,
  durationDays: 3, travelStyle: 'cultural', travelStyles: ['cultural'], pace: 'moderate', mustSee: [], preferences: '',
  visibility: 'public',
} as const;

describe('parseGeneratedTrip', () => {
  it('reads plain and fenced JSON', () => {
    expect(parseGeneratedTrip(JSON.stringify(generated))?.title).toBe('Lisbon in Three Days');
    expect(parseGeneratedTrip('```json\n' + JSON.stringify(generated) + '\n```')?.days).toHaveLength(1);
  });

  it('rejects text that is not a usable trip', () => {
    expect(parseGeneratedTrip('Sorry, I cannot help with that.')).toBeNull();
    expect(parseGeneratedTrip(JSON.stringify({ title: 'x' }))).toBeNull();
    expect(parseGeneratedTrip(JSON.stringify({ days: [] }))).toBeNull();
  });
});

describe('tripDocuments', () => {
  const NOW = 'NOW';
  const docs = tripDocuments('u1', request as never, generated as never, NOW);

  it('writes the trip exactly as generateTrip does', () => {
    expect(docs.trip).toMatchObject({
      authorUid: 'u1', title: 'Lisbon in Three Days', visibility: 'public', isAiGenerated: true,
      status: 'planning', collaborators: [], likesCount: 0, savesCount: 0, createdAt: NOW, updatedAt: NOW,
      destination: { name: 'Lisbon', placeId: null, lat: null, lng: null, countryCode: 'PT', bounds: null },
    });
  });

  it('writes each stop ungrounded, with its search query and joined notes', () => {
    const [act] = docs.days[0].activities;
    expect(act).toMatchObject({
      type: 'hotel', title: 'Check into Memmo Alfama', lat: null, lng: null, placeId: null,
      searchQuery: 'Memmo Alfama, Lisbon', notes: 'Central — Views', order: 0, visited: false, groundingFailedAt: null,
    });
  });

  it('merges extra fields into the trip (editorial seeding)', () => {
    const d = tripDocuments('u1', request as never, generated as never, NOW, { isEditorial: true, destinationKeys: ['lisbon'] });
    expect(d.trip).toMatchObject({ isEditorial: true, destinationKeys: ['lisbon'] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --watchAll=false __tests__/functions/tripDocs.test.ts`
Expected: FAIL — cannot find module `../../functions/src/tripDocs`.

- [ ] **Step 3: Implement**

```ts
// functions/src/tripDocs.ts
import type { GenerateTripRequest, GeneratedTrip } from './types';
import { resolveTripVisibility } from './promptRules';

/**
 * The documents an AI trip becomes — shared by generateTrip and the
 * editorial seed script (scripts/seed-destinations.mjs) so a seeded trip is
 * indistinguishable from one a traveler generated. Pure: timestamps come in
 * as `now`, nothing touches Firestore here.
 */
export function parseGeneratedTrip(text: string): GeneratedTrip | null {
  const jsonStr = text.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  const g = parsed as Partial<GeneratedTrip>;
  if (!g || typeof g.title !== 'string' || !Array.isArray(g.days)) return null;
  return g as GeneratedTrip;
}

export function tripDocuments(
  uid: string,
  data: GenerateTripRequest,
  generated: GeneratedTrip,
  now: unknown,
  extra: Record<string, unknown> = {},
) {
  const trip = {
    authorUid: uid,
    title: generated.title,
    description: generated.description,
    ...(data.additionalDestinations.length > 0 && typeof generated.region === 'string' && generated.region.trim()
      ? { regionName: generated.region.trim().slice(0, 60) }
      : {}),
    coverImageUrl: null,
    destination: {
      name: data.destination,
      placeId: null,
      lat: null,
      lng: null,
      countryCode: data.countryCode || null,
      bounds: null,
    },
    additionalDestinations: data.additionalDestinations ?? [],
    startDate: null as unknown,
    endDate: null as unknown,
    visibility: resolveTripVisibility(data.visibility),
    collaborators: [],
    budgetAmount: null,
    budgetCurrency: null,
    isAiGenerated: true,
    status: 'planning' as const,
    tags: [],
    likesCount: 0,
    savesCount: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };

  const days = generated.days.map((day) => ({
    day: {
      dayNumber: day.dayNumber,
      destinationIndex: typeof day.destinationIndex === 'number' ? day.destinationIndex : null,
      date: null,
      title: day.title,
      notes: day.notes,
      createdAt: now,
    },
    activities: (day.activities ?? []).map((act, idx) => ({
      type: act.type,
      title: act.title,
      placeId: null,
      address: act.address,
      lat: null,
      lng: null,
      startTime: act.startTime,
      endTime: act.endTime,
      durationMinutes: null,
      notes: [act.rationale, act.notes].filter(Boolean).join(' — '),
      bookingRef: null,
      cost: act.cost,
      currency: act.currency,
      mediaUrls: [],
      order: idx * 1000,
      createdAt: now,
      searchQuery: act.searchQuery,
      visited: false,
      visitedAt: null,
      groundingFailedAt: null,
    })),
  }));

  return { trip, days };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --watchAll=false __tests__/functions/tripDocs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Switch `generateTrip` to it (behaviour unchanged)**

In `functions/src/generateTrip.ts`, replace step 5 (the try/catch JSON parse) with:

```ts
    const generated = parseGeneratedTrip(text);
    if (!generated) {
      throw new functions.https.HttpsError('internal', 'Failed to parse Gemini response as JSON');
    }
```

and replace step 6 (from `const tripData = {` through `await batch.commit();`) with:

```ts
    const docs = tripDocuments(uid, data, generated, now, {
      startDate: data.startDate ? admin.firestore.Timestamp.fromDate(new Date(data.startDate)) : null,
      endDate: data.endDate ? admin.firestore.Timestamp.fromDate(new Date(data.endDate)) : null,
    });
    await tripRef.set(docs.trip);

    const batch = db.batch();
    for (const { day, activities } of docs.days) {
      const dayRef = tripRef.collection('days').doc();
      batch.set(dayRef, day);
      activities.forEach((act) => batch.set(dayRef.collection('activities').doc(), act));
    }
    await batch.commit();
```

Import `{ parseGeneratedTrip, tripDocuments } from './tripDocs'`; remove now-unused imports (`resolveTripVisibility` if only used there).

- [ ] **Step 6: Verify and commit**

Run: `(cd functions && npx tsc --noEmit) && npx jest --watchAll=false __tests__/functions`
Expected: no type errors; all function tests pass.

```bash
git add functions/src/tripDocs.ts functions/src/generateTrip.ts __tests__/functions/tripDocs.test.ts
git commit -m "refactor: one trip writer for generateTrip and the editorial seed"
```

Do **not** deploy `generateTrip` for this refactor alone; it ships with the next functions deploy (Task 4).

### Task 2: The catalog (`data/destinations.json`, `functions/src/catalog.ts`)

**Files:** Create `data/destinations.json`, `functions/src/catalog.ts`; test `__tests__/functions/catalog.test.ts`.

**Interfaces — Produces:**
- `type ContinentChip = 'europe' | 'asia' | 'americas' | 'africa-middle-east' | 'oceania'`
- `type Vibe = 'beaches' | 'food' | 'adventure' | 'culture' | 'nature' | 'nightlife'`
- `interface CatalogEntry { slug: string; name: string; countryCode: string; countryName: string; continentChip: ContinentChip; vibes: Vibe[]; popularity: number; query: string; styles: string[] }` — `query` is what Mapbox geocodes ("Lisbon, Portugal"); `styles` are the 2–3 travel styles its editorial itineraries use.
- `validateCatalog(entries: CatalogEntry[]): string[]` — problems, empty when valid.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/functions/catalog.test.ts
import { validateCatalog, type CatalogEntry } from '../../functions/src/catalog';
import catalog from '../../data/destinations.json';

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  slug: 'lisbon', name: 'Lisbon', countryCode: 'PT', countryName: 'Portugal', continentChip: 'europe',
  vibes: ['food', 'culture'], popularity: 80, query: 'Lisbon, Portugal', styles: ['cultural', 'budget'], ...over,
});

describe('validateCatalog', () => {
  it('accepts a well-formed entry', () => {
    expect(validateCatalog([entry()])).toEqual([]);
  });

  it('reports duplicate slugs, bad codes, bad popularity and empty vibes', () => {
    const problems = validateCatalog([
      entry(),
      entry({ name: 'Lisbon again' }),
      entry({ slug: 'x-y', countryCode: 'PRT' }),
      entry({ slug: 'z', popularity: 0, vibes: [] }),
    ]);
    expect(problems.join('\n')).toMatch(/duplicate slug: lisbon/);
    expect(problems.join('\n')).toMatch(/x-y: countryCode/);
    expect(problems.join('\n')).toMatch(/z: popularity/);
    expect(problems.join('\n')).toMatch(/z: vibes/);
  });

  it('reports slugs that are not lowercase-hyphenated', () => {
    expect(validateCatalog([entry({ slug: 'Rio de Janeiro' })]).join()).toMatch(/slug/);
  });
});

describe('data/destinations.json', () => {
  const entries = catalog as CatalogEntry[];

  it('is valid', () => {
    expect(validateCatalog(entries)).toEqual([]);
  });

  it('has about sixty destinations, every chip with at least four', () => {
    expect(entries.length).toBeGreaterThanOrEqual(55);
    for (const chip of ['europe', 'asia', 'americas', 'africa-middle-east', 'oceania']) {
      expect(entries.filter((e) => e.continentChip === chip).length).toBeGreaterThanOrEqual(4);
    }
    for (const vibe of ['beaches', 'food', 'adventure', 'culture', 'nature', 'nightlife']) {
      expect(entries.filter((e) => e.vibes.includes(vibe as never)).length).toBeGreaterThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --watchAll=false __tests__/functions/catalog.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the validator**

```ts
// functions/src/catalog.ts
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
```

- [ ] **Step 4: Write the catalog**

Create `data/destinations.json`: 60 entries covering every continent chip and vibe (test enforces ≥ 4 each). Popular cities and regions travelers plan around, e.g. Europe: Lisbon, Porto, Barcelona, Madrid, Seville, Paris, Amsterdam, London, Edinburgh, Dublin, Rome, Florence, Amalfi Coast, Venice, Santorini, Athens, Dubrovnik, Prague, Vienna, Budapest, Berlin, Copenhagen, Reykjavík, Swiss Alps (Interlaken); Asia: Tokyo, Kyoto, Seoul, Bangkok, Chiang Mai, Bali, Singapore, Hanoi, Ho Chi Minh City, Hong Kong; Americas: New York City, San Francisco, Los Angeles, Hawaii (Maui), New Orleans, Chicago, Vancouver, Banff, Mexico City, Tulum, Baja California Sur, Cartagena, Cusco, Buenos Aires, Rio de Janeiro, Patagonia; Africa & Middle East: Marrakech, Cape Town, Cairo, Dubai, Istanbul, Zanzibar; Oceania: Sydney, Melbourne, Queenstown, Fiji. Each with 2–3 `styles`, realistic `vibes`, `popularity` 40–100 and a `query` including the country.

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest --watchAll=false __tests__/functions/catalog.test.ts`
Expected: PASS (5 tests). If the catalog test fails, fix the data, not the thresholds.

- [ ] **Step 6: Commit**

```bash
git add data/destinations.json functions/src/catalog.ts __tests__/functions/catalog.test.ts
git commit -m "feat: the editorial destination catalog, validated"
```

### Task 3: Discovery rules (`functions/src/discovery.ts`)

**Files:** Create `functions/src/discovery.ts`; test `__tests__/functions/discovery.test.ts`.

**Interfaces — Produces:**
- `interface GeoBox { sw: [number, number]; ne: [number, number] }` (`[lng, lat]`)
- `interface TaggableDestination { slug: string; bbox: GeoBox }`
- `destinationKeysFor(points: { lat: number | null; lng: number | null }[], catalog: TaggableDestination[]): string[]` — sorted, unique slugs whose box contains any point.
- `sameKeys(a: string[] | undefined, b: string[]): boolean`
- `isAggregatable(trip: { visibility?: string; moderationHidden?: boolean; destinationKeys?: string[] }): boolean`
- `interface StopForRanking { placeId: string | null; name: string; type: string; lat: number; lng: number; tripId: string; saves: number }`
- `interface TopPlace { name: string; type: string; lat: number; lng: number; placeId: string | null; itineraryCount: number }`
- `rankTopPlaces(stops: StopForRanking[], limit?: number): TopPlace[]`
- `baselinePoints(dest: { slug: string; popularity: number; bbox: GeoBox }): [number, number, number][]` — 5 deterministic points
- `buildHeatPoints(baseline: [number, number, number][], community: { lat: number; lng: number; saves: number; likes: number }[], cap?: number): [number, number, number][]`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/functions/discovery.test.ts
import {
  destinationKeysFor, sameKeys, isAggregatable, rankTopPlaces, baselinePoints, buildHeatPoints,
} from '../../functions/src/discovery';

const tuscany = { slug: 'tuscany', bbox: { sw: [9.7, 42.2], ne: [12.4, 44.5] } as { sw: [number, number]; ne: [number, number] } };
const florence = { slug: 'florence', bbox: { sw: [11.15, 43.72], ne: [11.33, 43.83] } as { sw: [number, number]; ne: [number, number] } };
const lisbon = { slug: 'lisbon', bbox: { sw: [-9.23, 38.69], ne: [-9.09, 38.80] } as { sw: [number, number]; ne: [number, number] } };

describe('destinationKeysFor', () => {
  it('tags a trip with every destination box it touches, including overlaps', () => {
    expect(destinationKeysFor([{ lat: 43.77, lng: 11.25 }], [lisbon, tuscany, florence])).toEqual(['florence', 'tuscany']);
  });

  it('ignores ungrounded points and places outside every box', () => {
    expect(destinationKeysFor([{ lat: null, lng: null }, { lat: 0, lng: 0 }], [lisbon])).toEqual([]);
  });

  it('lists each destination once however many stops fall in it', () => {
    expect(destinationKeysFor([{ lat: 38.72, lng: -9.14 }, { lat: 38.71, lng: -9.13 }], [lisbon])).toEqual(['lisbon']);
  });
});

describe('sameKeys', () => {
  it('lets the trigger skip a write that would change nothing (no self-retrigger loop)', () => {
    expect(sameKeys(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameKeys(undefined, [])).toBe(true);
    expect(sameKeys(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('isAggregatable', () => {
  it('counts only public, visible, tagged trips', () => {
    expect(isAggregatable({ visibility: 'public', destinationKeys: ['lisbon'] })).toBe(true);
    expect(isAggregatable({ visibility: 'private', destinationKeys: ['lisbon'] })).toBe(false);
    expect(isAggregatable({ visibility: 'public', moderationHidden: true, destinationKeys: ['lisbon'] })).toBe(false);
    expect(isAggregatable({ visibility: 'public', destinationKeys: [] })).toBe(false);
  });
});

describe('rankTopPlaces', () => {
  const s = (name: string, tripId: string, over: Partial<{ placeId: string | null; saves: number; lat: number; lng: number }> = {}) => ({
    placeId: null, name, type: 'activity', lat: 38.7, lng: -9.14, tripId, saves: 0, ...over,
  });

  it('ranks by how many itineraries include the place, counting each trip once', () => {
    const top = rankTopPlaces([
      s('Belém Tower', 't1'), s('Belém Tower', 't2'), s('Belém Tower', 't2'),
      s('LX Factory', 't1'),
    ]);
    expect(top.map((p) => [p.name, p.itineraryCount])).toEqual([['Belém Tower', 2], ['LX Factory', 1]]);
  });

  it('merges by Google place id when there is one', () => {
    const top = rankTopPlaces([s('Torre de Belém', 't1', { placeId: 'P1' }), s('Belém Tower', 't2', { placeId: 'P1' })]);
    expect(top).toHaveLength(1);
    expect(top[0].itineraryCount).toBe(2);
  });

  it('breaks ties by saves and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`P${i}`, `t${i}`, { saves: i, lat: 38 + i / 100 }));
    const top = rankTopPlaces(many, 12);
    expect(top).toHaveLength(12);
    expect(top[0].name).toBe('P19');
  });
});

describe('baselinePoints', () => {
  it('spreads a destination over five stable points inside its box', () => {
    const pts = baselinePoints({ slug: 'lisbon', popularity: 80, bbox: lisbon.bbox });
    expect(pts).toHaveLength(5);
    expect(baselinePoints({ slug: 'lisbon', popularity: 80, bbox: lisbon.bbox })).toEqual(pts);
    for (const [lng, lat, w] of pts) {
      expect(lng).toBeGreaterThanOrEqual(-9.23);
      expect(lng).toBeLessThanOrEqual(-9.09);
      expect(lat).toBeGreaterThanOrEqual(38.69);
      expect(lat).toBeLessThanOrEqual(38.80);
      expect(w).toBe(16);
    }
  });
});

describe('buildHeatPoints', () => {
  it('weights community stops by saves and likes, rounds, and caps the total', () => {
    const pts = buildHeatPoints([[1, 2, 10]], [{ lat: 38.123456, lng: -9.654321, saves: 2, likes: 1 }]);
    expect(pts).toContainEqual([-9.6543, 38.1235, 6]);
    expect(pts).toContainEqual([1, 2, 10]);
    const many = Array.from({ length: 5000 }, (_, i) => ({ lat: i / 1000, lng: 0, saves: 0, likes: 0 }));
    expect(buildHeatPoints([[5, 5, 99]], many, 4000)).toHaveLength(4000);
    expect(buildHeatPoints([[5, 5, 99]], many, 4000)[0]).toEqual([5, 5, 99]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --watchAll=false __tests__/functions/discovery.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// functions/src/discovery.ts
/**
 * Pure rules behind destination pages and the globe heat map. No
 * firebase-admin, so every decision is tested (__tests__/functions/discovery).
 */
export interface GeoBox { sw: [number, number]; ne: [number, number] }
export interface TaggableDestination { slug: string; bbox: GeoBox }

function inBox(lat: number, lng: number, b: GeoBox): boolean {
  return lng >= b.sw[0] && lng <= b.ne[0] && lat >= b.sw[1] && lat <= b.ne[1];
}

/** Catalog destinations a trip visits: every box containing any grounded point, overlaps included. */
export function destinationKeysFor(
  points: { lat: number | null; lng: number | null }[],
  catalog: TaggableDestination[],
): string[] {
  const keys = new Set<string>();
  for (const p of points) {
    if (p.lat == null || p.lng == null) continue;
    for (const d of catalog) if (inBox(p.lat, p.lng, d.bbox)) keys.add(d.slug);
  }
  return [...keys].sort();
}

/** Lets tagTripDestinations skip a write that changes nothing — its own write re-triggers it. */
export function sameKeys(a: string[] | undefined, b: string[]): boolean {
  const x = a ?? [];
  return x.length === b.length && x.every((k, i) => k === b[i]);
}

/** Only public, un-hidden, tagged trips feed destination pages and the heat map. */
export function isAggregatable(trip: { visibility?: string; moderationHidden?: boolean; destinationKeys?: string[] }): boolean {
  return trip.visibility === 'public' && !trip.moderationHidden && (trip.destinationKeys?.length ?? 0) > 0;
}

export interface StopForRanking { placeId: string | null; name: string; type: string; lat: number; lng: number; tripId: string; saves: number }
export interface TopPlace { name: string; type: string; lat: number; lng: number; placeId: string | null; itineraryCount: number }

/** Places ranked by how many itineraries include them (each trip counted once), ties by saves. */
export function rankTopPlaces(stops: StopForRanking[], limit = 12): TopPlace[] {
  const groups = new Map<string, { place: TopPlace; trips: Set<string>; saves: number }>();
  for (const s of stops) {
    const key = s.placeId ? `id:${s.placeId}` : `at:${s.name.trim().toLowerCase()}@${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
    const g = groups.get(key) ?? {
      place: { name: s.name, type: s.type, lat: s.lat, lng: s.lng, placeId: s.placeId, itineraryCount: 0 },
      trips: new Set<string>(),
      saves: 0,
    };
    if (!g.trips.has(s.tripId)) {
      g.trips.add(s.tripId);
      g.saves += s.saves;
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g.place, itineraryCount: g.trips.size, saves: g.saves }))
    .sort((a, b) => b.itineraryCount - a.itineraryCount || b.saves - a.saves || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ saves: _saves, ...p }) => p);
}

/** Deterministic 0–1 value from a string — the same destination always gets the same spread. */
function seeded(slug: string, i: number): number {
  let h = 2166136261;
  for (const c of `${slug}#${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** The world baseline: a destination's popularity spread over five points inside its box. */
export function baselinePoints(dest: { slug: string; popularity: number; bbox: GeoBox }): [number, number, number][] {
  const { sw, ne } = dest.bbox;
  const weight = Math.round(dest.popularity / 5);
  return Array.from({ length: 5 }, (_, i) => {
    // Middle 60% of the box: the city, not its outskirts.
    const fx = 0.2 + 0.6 * seeded(dest.slug, i * 2);
    const fy = 0.2 + 0.6 * seeded(dest.slug, i * 2 + 1);
    return [r4(sw[0] + (ne[0] - sw[0]) * fx), r4(sw[1] + (ne[1] - sw[1]) * fy), weight];
  });
}

/** Baseline plus community stops (1 + 2·saves + likes), heaviest first, capped. */
export function buildHeatPoints(
  baseline: [number, number, number][],
  community: { lat: number; lng: number; saves: number; likes: number }[],
  cap = 4000,
): [number, number, number][] {
  const all: [number, number, number][] = [
    ...baseline,
    ...community.map((c) => [r4(c.lng), r4(c.lat), 1 + 2 * c.saves + c.likes] as [number, number, number]),
  ];
  return all.sort((a, b) => b[2] - a[2]).slice(0, cap);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --watchAll=false __tests__/functions/discovery.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/discovery.ts __tests__/functions/discovery.test.ts
git commit -m "feat: discovery rules — trip tagging, top places, heat points"
```

### Task 4: The two Cloud Functions, rules and index

**Files:** Create `functions/src/discoveryFunctions.ts`; modify `functions/src/index.ts`, `firestore.rules`, `firestore.indexes.json`.

**Interfaces — Consumes:** everything from Task 3. **Produces:** exported `tagTripDestinations`, `aggregateDiscovery`; Firestore `destinations/{slug}` fields `topPlaces`, `itineraryCount`, `communityTripCount`, `aggregatedAt`; `aggregates/heatmap` `{ points, updatedAt }`.

- [ ] **Step 1: Implement**

```ts
// functions/src/discoveryFunctions.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  destinationKeysFor, sameKeys, isAggregatable, rankTopPlaces, baselinePoints, buildHeatPoints,
  type TaggableDestination, type StopForRanking, type GeoBox,
} from './discovery';

const db = () => admin.firestore();

// The catalog barely changes; one read per warm instance, refreshed every 10 minutes.
let catalogCache: { at: number; entries: (TaggableDestination & { popularity: number })[] } | null = null;
async function loadCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache.entries;
  const snap = await db().collection('destinations').get();
  const entries = snap.docs
    .map((d) => ({ slug: d.id, bbox: d.get('bbox') as GeoBox | undefined, popularity: (d.get('popularity') as number) ?? 50 }))
    .filter((d): d is TaggableDestination & { popularity: number } => !!d.bbox);
  catalogCache = { at: Date.now(), entries };
  return entries;
}

/**
 * Tags a public trip with the catalog destinations it visits, so a
 * destination page lists community trips with one array-contains query.
 * Clears the tags when a trip stops being public. Its own write re-triggers
 * it; sameKeys makes that second run a no-op.
 */
export const tagTripDestinations = onDocumentWritten('trips/{tripId}', async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const trip = after.data()!;
  const current = trip.destinationKeys as string[] | undefined;
  // Editorial trips are tagged at seed time with exactly their destination.
  if (trip.isEditorial) return;

  let next: string[] = [];
  if (trip.visibility === 'public') {
    const catalog = await loadCatalog();
    const points = [trip.destination, ...(trip.additionalDestinations ?? [])]
      .map((d: { lat?: number | null; lng?: number | null }) => ({ lat: d?.lat ?? null, lng: d?.lng ?? null }));
    next = destinationKeysFor(points, catalog);
  }
  if (sameKeys(current, next)) return;
  await after.ref.update({ destinationKeys: next });
});

/**
 * Daily: each destination's top places, trip counts, and the globe's heat
 * points. One pass over public tagged trips on the server, instead of every
 * phone reading every trip's activities.
 */
export const aggregateDiscovery = onSchedule({ schedule: 'every day 04:00', timeZone: 'UTC', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  await runAggregation();
});

export async function runAggregation(): Promise<{ trips: number; points: number }> {
  const catalog = await loadCatalog();
  const tripsSnap = await db().collection('trips').where('visibility', '==', 'public').get();
  const trips = tripsSnap.docs.filter((d) => isAggregatable(d.data()));

  const stopsBySlug = new Map<string, StopForRanking[]>();
  const tripCount = new Map<string, { editorial: number; community: number }>();
  const community: { lat: number; lng: number; saves: number; likes: number }[] = [];

  for (const t of trips) {
    const data = t.data();
    const saves = (data.savesCount as number) ?? 0;
    const likes = (data.likesCount as number) ?? 0;
    const keys = data.destinationKeys as string[];
    for (const k of keys) {
      const c = tripCount.get(k) ?? { editorial: 0, community: 0 };
      if (data.isEditorial) c.editorial += 1; else c.community += 1;
      tripCount.set(k, c);
    }
    const days = await t.ref.collection('days').get();
    for (const day of days.docs) {
      const acts = await day.ref.collection('activities').get();
      for (const a of acts.docs) {
        const act = a.data();
        if (act.lat == null || act.lng == null) continue;
        community.push({ lat: act.lat, lng: act.lng, saves, likes });
        const stop: StopForRanking = {
          placeId: act.placeId ?? null, name: act.placeName || act.title, type: act.type,
          lat: act.lat, lng: act.lng, tripId: t.id, saves,
        };
        for (const k of keys) stopsBySlug.set(k, [...(stopsBySlug.get(k) ?? []), stop]);
      }
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db().batch();
  for (const d of catalog) {
    const counts = tripCount.get(d.slug) ?? { editorial: 0, community: 0 };
    batch.set(db().doc(`destinations/${d.slug}`), {
      topPlaces: rankTopPlaces(stopsBySlug.get(d.slug) ?? []),
      itineraryCount: counts.editorial + counts.community,
      communityTripCount: counts.community,
      aggregatedAt: now,
    }, { merge: true });
  }
  const points = buildHeatPoints(catalog.flatMap((d) => baselinePoints(d)), community);
  // Firestore can't store nested arrays: [lng, lat, weight] triples are flattened.
  batch.set(db().doc('aggregates/heatmap'), { points: points.flat(), stride: 3, updatedAt: now });
  await batch.commit();
  return { trips: trips.length, points: points.length };
}
```

Export both from `functions/src/index.ts` (`export { tagTripDestinations, aggregateDiscovery } from './discoveryFunctions';`).

- [ ] **Step 2: Rules and index**

In `firestore.rules`, top level inside `match /databases/{database}/documents {`, add:

```
    // Editorial destination catalog and its daily aggregates
    // (functions/src/discoveryFunctions.ts). Written only by the Admin SDK.
    match /destinations/{slug} {
      allow read: if isAuthed();
      allow write: if false;
    }
    match /aggregates/{docId} {
      allow read: if isAuthed();
      allow write: if false;
    }
```

In `firestore.indexes.json` add (destination pages, Part 3):

```json
{ "collectionGroup": "trips", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "visibility", "order": "ASCENDING" },
  { "fieldPath": "destinationKeys", "arrayConfig": "CONTAINS" },
  { "fieldPath": "savesCount", "order": "DESCENDING" } ] }
```

- [ ] **Step 3: Verify, deploy only these, commit**

Run: `(cd functions && npx tsc --noEmit) && npx jest --watchAll=false`
Expected: clean; all suites pass.

Run: `npx firebase-tools deploy --only firestore:rules,firestore:indexes` then `(cd functions && npm run build && npx firebase-tools deploy --only functions:tagTripDestinations,functions:aggregateDiscovery,functions:generateTrip)`
Expected: `Deploy complete!` for each.

```bash
git add functions/src/discoveryFunctions.ts functions/src/index.ts firestore.rules firestore.indexes.json
git commit -m "feat: tag trips with destinations; daily top places and heat map"
```

### Task 5: The seed script

**Files:** Create `functions/src/seedSupport.ts`, `scripts/seed-destinations.mjs`; test `__tests__/functions/seedSupport.test.ts`.

**Interfaces — Produces (pure, tested):**
- `mapboxPlaceUrl(query: string, token: string, countryCode?: string | null): string` — Search Box forward, `types=place,region,locality,district`, limit 1.
- `parsePlaceFeature(json: unknown): { lng: number; lat: number; bbox: GeoBox | null; name: string } | null`
- `mapboxPoiUrl(query: string, token: string, bbox: GeoBox, center: [number, number]): string` — stop grounding inside the box.
- `googleTextSearchBody(query: string, center: [number, number] | null): object` and `GOOGLE_GROUNDING_MASK` / `GOOGLE_COVER_MASK` strings.
- `parseGooglePlace(json: unknown): { placeId: string; name: string; lat: number; lng: number; photoName: string | null } | null`
- `coverPhotoUrl(photoName: string, key: string): string`
- `padBox(center: [number, number], bbox: GeoBox | null, minDegrees?: number): GeoBox` — guarantees a usable box (≥ 0.1° each side) for small places.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/functions/seedSupport.test.ts
import {
  mapboxPlaceUrl, parsePlaceFeature, mapboxPoiUrl, googleTextSearchBody, parseGooglePlace, coverPhotoUrl, padBox,
} from '../../functions/src/seedSupport';

describe('mapbox place lookup', () => {
  it('asks for a place, region or locality in the right country', () => {
    const url = new URL(mapboxPlaceUrl('Lisbon, Portugal', 'tok', 'PT'));
    expect(url.pathname).toBe('/search/searchbox/v1/forward');
    expect(url.searchParams.get('country')).toBe('pt');
    expect(url.searchParams.get('types')).toBe('place,region,locality,district');
  });

  it('reads the centre and box', () => {
    const f = parsePlaceFeature({ features: [{ geometry: { coordinates: [-9.14, 38.72] }, properties: { name: 'Lisbon', bbox: [-9.23, 38.69, -9.09, 38.80] } }] });
    expect(f).toEqual({ lng: -9.14, lat: 38.72, name: 'Lisbon', bbox: { sw: [-9.23, 38.69], ne: [-9.09, 38.80] } });
    expect(parsePlaceFeature({ features: [] })).toBeNull();
  });
});

describe('padBox', () => {
  it('keeps a large box and pads a missing or tiny one around the centre', () => {
    const big = { sw: [-9.3, 38.6], ne: [-9.0, 38.9] } as never;
    expect(padBox([-9.14, 38.72], big)).toBe(big);
    expect(padBox([10, 20], null)).toEqual({ sw: [9.9, 19.9], ne: [10.1, 20.1] });
  });
});

describe('stop grounding requests', () => {
  it('bounds the POI search to the destination box', () => {
    const url = new URL(mapboxPoiUrl('Belém Tower, Lisbon', 'tok', { sw: [-9.3, 38.6], ne: [-9.0, 38.9] }, [-9.14, 38.72]));
    expect(url.searchParams.get('bbox')).toBe('-9.3,38.6,-9,38.9');
    expect(url.searchParams.get('proximity')).toBe('-9.14,38.72');
  });

  it('biases a Google fallback to the centre', () => {
    expect(googleTextSearchBody('Belém Tower', [-9.14, 38.72])).toMatchObject({
      textQuery: 'Belém Tower', maxResultCount: 1,
      locationBias: { circle: { center: { latitude: 38.72, longitude: -9.14 } } },
    });
  });
});

describe('parseGooglePlace / coverPhotoUrl', () => {
  it('reads the first place and its first photo', () => {
    const p = parseGooglePlace({ places: [{ id: 'P1', displayName: { text: 'Lisbon' }, location: { latitude: 38.7, longitude: -9.1 }, photos: [{ name: 'places/P1/photos/abc' }] }] });
    expect(p).toEqual({ placeId: 'P1', name: 'Lisbon', lat: 38.7, lng: -9.1, photoName: 'places/P1/photos/abc' });
    expect(coverPhotoUrl('places/P1/photos/abc', 'K')).toBe('https://places.googleapis.com/v1/places/P1/photos/abc/media?maxWidthPx=1200&key=K');
    expect(parseGooglePlace({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --watchAll=false __tests__/functions/seedSupport.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `functions/src/seedSupport.ts`**

```ts
// functions/src/seedSupport.ts
import type { GeoBox } from './discovery';

/** Pure request builders and parsers for scripts/seed-destinations.mjs (compiled to functions/lib). */
const SEARCHBOX = 'https://api.mapbox.com/search/searchbox/v1/forward';

export const GOOGLE_GROUNDING_MASK = 'places.id,places.displayName,places.location';
export const GOOGLE_COVER_MASK = 'places.id,places.displayName,places.location,places.photos';

export function mapboxPlaceUrl(query: string, token: string, countryCode?: string | null): string {
  const qs = new URLSearchParams({ q: query, access_token: token, limit: '1', language: 'en', types: 'place,region,locality,district' });
  if (countryCode) qs.set('country', countryCode.toLowerCase());
  return `${SEARCHBOX}?${qs.toString()}`;
}

export function parsePlaceFeature(json: unknown): { lng: number; lat: number; bbox: GeoBox | null; name: string } | null {
  const f = (json as { features?: { geometry?: { coordinates?: number[] }; properties?: { name?: string; bbox?: number[] } }[] })?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (!c || c.length < 2) return null;
  const b = f?.properties?.bbox;
  return {
    lng: c[0],
    lat: c[1],
    name: f?.properties?.name ?? '',
    bbox: b && b.length >= 4 ? { sw: [b[0], b[1]], ne: [b[2], b[3]] } : null,
  };
}

/** A usable grounding box: the geocoder's, unless missing or smaller than ±minDegrees around the centre. */
export function padBox(center: [number, number], bbox: GeoBox | null, minDegrees = 0.1): GeoBox {
  if (bbox && bbox.ne[0] - bbox.sw[0] >= minDegrees * 2 && bbox.ne[1] - bbox.sw[1] >= minDegrees * 2) return bbox;
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { sw: [r(center[0] - minDegrees), r(center[1] - minDegrees)], ne: [r(center[0] + minDegrees), r(center[1] + minDegrees)] };
}

export function mapboxPoiUrl(query: string, token: string, bbox: GeoBox, center: [number, number]): string {
  const qs = new URLSearchParams({
    q: query, access_token: token, limit: '1', language: 'en',
    bbox: [...bbox.sw, ...bbox.ne].join(','), proximity: center.join(','),
  });
  return `${SEARCHBOX}?${qs.toString()}`;
}

export function googleTextSearchBody(query: string, center: [number, number] | null): object {
  return {
    textQuery: query,
    maxResultCount: 1,
    languageCode: 'en',
    ...(center ? { locationBias: { circle: { center: { latitude: center[1], longitude: center[0] }, radius: 30_000 } } } : {}),
  };
}

export function parseGooglePlace(json: unknown): { placeId: string; name: string; lat: number; lng: number; photoName: string | null } | null {
  const p = (json as { places?: { id?: string; displayName?: { text?: string }; location?: { latitude?: number; longitude?: number }; photos?: { name?: string }[] }[] })?.places?.[0];
  if (!p?.id || p.location?.latitude == null || p.location?.longitude == null) return null;
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    lat: p.location.latitude,
    lng: p.location.longitude,
    photoName: p.photos?.[0]?.name ?? null,
  };
}

/** Same URL shape the app stores for trip covers (services/places/googlePlaces photoUrl). */
export function coverPhotoUrl(photoName: string, key: string): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${key}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --watchAll=false __tests__/functions/seedSupport.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the runner `scripts/seed-destinations.mjs`**

```js
#!/usr/bin/env node
// Seeds the editorial destination catalog. Idempotent: re-run to fill gaps.
//   node scripts/seed-destinations.mjs --dry-run          # plan only, no writes, no paid calls
//   node scripts/seed-destinations.mjs --only lisbon      # one destination
//   node scripts/seed-destinations.mjs --limit 2          # first N destinations
//   node scripts/seed-destinations.mjs                    # everything, then aggregate
// Needs: ~/.config/supernova/service-account.json, functions/.env (GEMINI_API_KEY),
// .env.local (EXPO_PUBLIC_MAPBOX_TOKEN, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). Prints no secrets.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const lib = (m) => require(join(root, 'functions', 'lib', m));

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

function envFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const keyPath = join(homedir(), '.config/supernova/service-account.json');
if (!existsSync(keyPath)) throw new Error(`Missing ${keyPath}`);
const fnEnv = envFile(join(root, 'functions/.env'));
const appEnv = envFile(join(root, '.env.local'));
const GEMINI = fnEnv.GEMINI_API_KEY;
const MAPBOX = appEnv.EXPO_PUBLIC_MAPBOX_TOKEN;
const GOOGLE = appEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
for (const [n, v] of Object.entries({ GEMINI, MAPBOX, GOOGLE })) if (!v) throw new Error(`Missing ${n}`);

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();
// Loaded after initializeApp so no module can touch Firebase before it's configured.
const { buildPrompt } = lib('generateTrip.js');
const { parseGeneratedTrip, tripDocuments } = lib('tripDocs.js');
const { validateCatalog } = lib('catalog.js');
const S = lib('seedSupport.js');
const { runAggregation } = lib('discoveryFunctions.js');
const catalog = JSON.parse(readFileSync(join(root, 'data/destinations.json'), 'utf8'));
const problems = validateCatalog(catalog);
if (problems.length) throw new Error(`Catalog invalid:\n${problems.join('\n')}`);

const EDITORIAL_EMAIL = 'editorial@galaxielabs.space';
const report = { ok: [], skipped: [], failed: [] };

async function editorialUid() {
  try {
    return (await admin.auth().getUserByEmail(EDITORIAL_EMAIL)).uid;
  } catch {
    if (DRY) return 'DRY-RUN-UID';
    const user = await admin.auth().createUser({ email: EDITORIAL_EMAIL, emailVerified: true, displayName: 'Supernova', disabled: false });
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, fullName: 'Supernova', displayName: 'Supernova', username: 'supernova', avatarUrl: null,
      bio: 'Trips planned by the Supernova team.', location: '', followersCount: 0, followingCount: 0, tripsCount: 0,
      isEditorial: true, hasSeenOnboarding: true, createdAt: now,
    });
    await db.doc('usernames/supernova').set({ uid: user.uid });
    return user.uid;
  }
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).host}`);
  return res.json();
}

async function googleSearch(query, center, mask) {
  return S.parseGooglePlace(await getJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE, 'X-Goog-FieldMask': mask },
    body: JSON.stringify(S.googleTextSearchBody(query, center)),
  }));
}

async function groundStop(query, box, center) {
  const hit = S.parsePlaceFeature(await getJson(S.mapboxPoiUrl(query, MAPBOX, box, center)));
  if (hit) return { lat: hit.lat, lng: hit.lng, placeId: null, placeName: hit.name };
  const g = await googleSearch(query, center, S.GOOGLE_GROUNDING_MASK);
  return g ? { lat: g.lat, lng: g.lng, placeId: g.placeId, placeName: g.name } : null;
}

async function seedDestination(entry, uid, gemini) {
  const ref = db.doc(`destinations/${entry.slug}`);
  const existing = (await ref.get()).data() ?? {};

  // 1. Centre and box, once.
  let { center, bbox } = existing;
  if (!center || !bbox) {
    const place = S.parsePlaceFeature(await getJson(S.mapboxPlaceUrl(entry.query, MAPBOX, entry.countryCode)));
    if (!place) throw new Error('Mapbox could not place it');
    center = { lat: place.lat, lng: place.lng };
    bbox = S.padBox([place.lng, place.lat], place.bbox);
  }

  // 2. Cover, once.
  let coverImageUrl = existing.coverImageUrl ?? null;
  let placeId = existing.placeId ?? null;
  if (!coverImageUrl && !DRY) {
    const g = await googleSearch(entry.query, [center.lng, center.lat], S.GOOGLE_COVER_MASK);
    if (g?.photoName) coverImageUrl = S.coverPhotoUrl(g.photoName, GOOGLE);
    placeId = g?.placeId ?? placeId;
  }

  const doc = {
    slug: entry.slug, name: entry.name, countryCode: entry.countryCode, countryName: entry.countryName,
    continentChip: entry.continentChip, vibes: entry.vibes, popularity: entry.popularity,
    center, bbox, coverImageUrl, placeId, order: entry.popularity,
  };
  if (DRY) {
    console.log(`  would write destinations/${entry.slug}`, { center, coverImageUrl: !!coverImageUrl });
  } else {
    await ref.set(doc, { merge: true });
  }

  // 3. Editorial itineraries — only as many as are missing (re-run safe).
  const have = DRY ? 0 : (await db.collection('trips')
    .where('isEditorial', '==', true).where('destinationKeys', 'array-contains', entry.slug).get()).size;
  const want = entry.styles.slice(have);
  for (const [i, style] of want.entries()) {
    const durationDays = [3, 5, 4][(have + i) % 3];
    const request = {
      destination: entry.name, countryCode: entry.countryCode, additionalDestinations: [],
      startDate: null, endDate: null, durationDays, travelStyle: style, travelStyles: [style],
      pace: 'moderate', mustSee: [], preferences: '', visibility: 'public',
    };
    if (DRY) { console.log(`  would generate a ${durationDays}-day ${style} itinerary`); continue; }
    const text = (await gemini.generateContent(buildPrompt(request))).response.text();
    const generated = parseGeneratedTrip(text);
    if (!generated) { console.log(`  skipped a ${style} itinerary: unusable Gemini response`); continue; }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docs = tripDocuments(uid, request, generated, now, {
      isEditorial: true,
      destinationKeys: [entry.slug],
      coverImageUrl,
      destination: { name: entry.name, placeId, lat: center.lat, lng: center.lng, countryCode: entry.countryCode, bounds: bbox },
    });
    // Ground before writing, so no half-grounded trip is ever public.
    for (const { activities } of docs.days) {
      for (const act of activities) {
        if (!act.searchQuery) continue;
        const hit = await groundStop(act.searchQuery, bbox, [center.lng, center.lat]).catch(() => null);
        if (hit) Object.assign(act, hit);
        else act.groundingFailedAt = now;
      }
    }
    const tripRef = db.collection('trips').doc();
    await tripRef.set(docs.trip);
    const batch = db.batch();
    for (const { day, activities } of docs.days) {
      const dayRef = tripRef.collection('days').doc();
      batch.set(dayRef, day);
      activities.forEach((a) => batch.set(dayRef.collection('activities').doc(), a));
    }
    await batch.commit();
    console.log(`  wrote "${generated.title}" (${tripRef.id})`);
  }
}

const uid = await editorialUid();
const gemini = new GoogleGenerativeAI(GEMINI).getGenerativeModel({ model: 'gemini-2.5-flash' });
const targets = catalog.filter((e) => !only || e.slug === only).slice(0, limit);
console.log(`${DRY ? '[dry run] ' : ''}Seeding ${targets.length} destination(s) as ${uid}`);
for (const entry of targets) {
  console.log(`• ${entry.name}`);
  try {
    await seedDestination(entry, uid, gemini);
    report.ok.push(entry.slug);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    report.failed.push(entry.slug);
  }
}
if (!DRY && report.ok.length) {
  const r = await runAggregation();
  console.log(`Aggregated: ${r.trips} trips, ${r.points} heat points`);
}
console.log(`Done — ok: ${report.ok.length}, failed: ${report.failed.length}${report.failed.length ? ` (${report.failed.join(', ')})` : ''}`);
process.exit(report.failed.length ? 1 : 0);
```

`runAggregation` must be exported from `discoveryFunctions.ts` (Task 4 already does) and must not rely on the Functions runtime having initialised admin — the script initialises it first; `discoveryFunctions` only calls `admin.firestore()` lazily.

- [ ] **Step 6: Build and dry-run**

Run: `(cd functions && npm run build) && node scripts/seed-destinations.mjs --dry-run --limit 3`
Expected: "[dry run] Seeding 3 destination(s)", a centre per destination, "would generate" lines, `Done — ok: 3, failed: 0`. No Firestore writes (check the console shows no new `destinations` docs).

- [ ] **Step 7: Commit**

```bash
git add functions/src/seedSupport.ts __tests__/functions/seedSupport.test.ts scripts/seed-destinations.mjs
git commit -m "feat: editorial destination seed script"
```

### Task 6: Trial, review, full run

- [ ] **Step 1: Trial on two destinations**

Run: `node scripts/seed-destinations.mjs --only lisbon && node scripts/seed-destinations.mjs --only kyoto`
Expected: each writes its `destinations/{slug}` doc and 2–3 trips, then "Aggregated: …". Open one new trip in the app (Explore → Latest trips): cover photo, named stops on the map, `Upcoming`/no-date status, author "Supernova".

- [ ] **Step 2: Checkpoint with the user** — show the two destinations' trips (titles, stop counts, grounded share, cover) before spending on the other ~58. This run publishes public content and costs money; proceed only on a yes.

- [ ] **Step 3: Full run**

Run: `node scripts/seed-destinations.mjs`
Expected: `Done — ok: ~60, failed: few`; re-run once to retry failures (idempotent). Then confirm in Firestore: `destinations` ≈ 60 docs with `topPlaces`; `aggregates/heatmap.points.length / 3` > 300; Explore's trending row and the globe's trending pins show many destinations (both already read public trips).

- [ ] **Step 4: Docs and commit**

Add to CLAUDE.md: the catalog, `destinations/*` and `aggregates/*` collections, `tagTripDestinations`/`aggregateDiscovery`, the seed script and its flags, the editorial account, and that `deleteAccount` must never be run against it.

```bash
git add CLAUDE.md
git commit -m "docs: discovery data — catalog, seed script, aggregates"
```
