# Social Wish List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share a TikTok post to Supernova, confirm the places it names, keep them in a private Wish list grouped by city, and add them to any day of an upcoming trip nearby.

**Architecture:** Pure rules on both sides (`functions/src/socialPost.ts`, `utils/wishlist.ts`) carry every decision; one callable `readSocialPost` resolves the link, enforces the monthly limit in a transaction, reads TikTok oEmbed, asks Gemini for place names once per video (server cache `socialPosts/{videoId}`) and places them with Mapbox. The app owns `users/{uid}/wishlist/{videoId}` (owner-only, whitelisted keys) and shows it on Profile (Wish list filter), on trips (Wish list chip) and on a saved-place screen. `expo-share-intent` delivers shares into the app.

**Tech Stack:** Firebase Functions v2 (`onCall`), Gemini via `functions/src/agentModel.ts` `generateJson`, Mapbox Geocoding v6, TikTok oEmbed, Expo Router, `expo-share-intent@~5.1.0` (Expo SDK 54), TanStack Query, Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-social-wishlist-design.md`

## Global Constraints

- TikTok only; any other link → "Supernova can save TikTok posts for now".
- Private: `users/{uid}/wishlist` is owner read/write/delete only; nothing shown on public profiles or to trip members.
- Free tier 20 new videos per calendar month (UTC), Pro/Business unlimited, everyone ≤ 30 new videos per hour; a video already counted this month is free; limits checked **before** any AI call.
- AI consent purpose `agent` (same as Nova) before `readSocialPost` does anything.
- Gemini reads only the caption and creator handle; ≤ 10 places; never guessed places; `gemini-2.5-flash`, thinking 0.
- No images stored anywhere; covers fetched fresh from oEmbed by the app.
- Google Places never called by this feature (Mapbox only).
- Trip match: a saved place within **50 km** of any city of an **upcoming or current** trip.
- Copy: sentence case, no emoji, verb-first; design checklist (`.claude/skills/supernova-design/SKILL.md`) for every screen.
- No `onSnapshot`; `useTheme()` colours; FlashList for lists; `KeyboardLift` around any form with a text field.

## Review Focus

1. A share whose text has words around the link ("Check this out https://vm.tiktok.com/ZM8x/ #tokyo") — the link is found. Test: Task 3 `tiktokUrlFromShare`.
2. The same user shares the same video twice in a month — counted once, no second AI call. Test: Task 1 `wishQuota`.
3. Gemini returns the city itself, a duplicate, or an empty name as a "place" — dropped. Test: Task 1 `cleanPlaces`.
4. A saved place near a trip that already ended — no chip, no "Fits your trip". Test: Task 3 `wishMatches`.
5. A Tokyo video that also names a Kyoto restaurant — grounded in Kyoto and matched to a Kyoto trip, not Tokyo. Test: Task 1 `parsePlacesAnswer` keeps each place's own city; Task 3 `wishMatches` by distance.

---

### Task 1: Server rules (pure)

**Files:**
- Create: `functions/src/socialPost.ts`
- Test: `__tests__/functions/socialPost.test.ts`

**Interfaces — Produces:**
```ts
export type PlaceKind = 'restaurant' | 'bar' | 'cafe' | 'sight' | 'hotel' | 'activity' | 'shop' | 'other';
export interface FoundPlace { name: string; kind: PlaceKind; city: string | null }
export interface PlacesAnswer { city: string | null; country: string | null; places: FoundPlace[] }
export function isTikTokHost(host: string): boolean;                 // tiktok.com, www., m., vm., vt.
export function tiktokVideoId(url: string): string | null;            // /@user/video/123 or /video/123 → '123'
export function isShortTikTok(url: string): boolean;                  // vm./vt. hosts or /t/ paths
export function trimCaption(s: unknown): string;                      // ≤ 300 chars, single-spaced
export const PLACES_SYSTEM: string; export const PLACES_SCHEMA: object;
export function placesPrompt(caption: string, authorHandle: string): string;
export function parsePlacesAnswer(text: unknown): PlacesAnswer | null;
export function cleanPlaces(a: PlacesAnswer): PlacesAnswer;           // trim, dedupe (case/accents), drop city/country names, ≤ 10
export function monthKey(nowMs: number): string;                      // 'YYYY-MM' UTC
export function hourKey(nowMs: number): string;                       // 'YYYY-MM-DDTHH' UTC
export type QuotaDoc = { videos?: string[]; hours?: Record<string, number> };
export function wishQuota(doc: QuotaDoc, videoId: string, paid: boolean, nowMs: number):
  { ok: true; counted: boolean; patch: QuotaDoc } | { ok: false; reason: 'monthly' | 'hourly' };
export function pickByName(name: string, features: { name: string; lat: number; lng: number }[], center: { lat: number; lng: number } | null, maxKm?: number): { lat: number; lng: number } | null;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { isTikTokHost, tiktokVideoId, isShortTikTok, trimCaption, parsePlacesAnswer, cleanPlaces, wishQuota, monthKey, pickByName } from '../../functions/src/socialPost';

describe('TikTok links', () => {
  it('knows TikTok hosts and nothing else', () => {
    for (const h of ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']) expect(isTikTokHost(h)).toBe(true);
    for (const h of ['tiktok.com.evil.io', 'nottiktok.com', 'instagram.com']) expect(isTikTokHost(h)).toBe(false);
  });
  it('reads the video id from a full link', () => {
    expect(tiktokVideoId('https://www.tiktok.com/@foodie_tokyo/video/7300000000000000001?is_from_webapp=1')).toBe('7300000000000000001');
    expect(tiktokVideoId('https://m.tiktok.com/v/7300000000000000002.html')).toBe('7300000000000000002');
    expect(tiktokVideoId('https://vm.tiktok.com/ZM8xAbc/')).toBeNull();
    expect(tiktokVideoId('https://evil.io/@x/video/123')).toBeNull();
  });
  it('spots short links that must be followed first', () => {
    expect(isShortTikTok('https://vm.tiktok.com/ZM8xAbc/')).toBe(true);
    expect(isShortTikTok('https://www.tiktok.com/t/ZT8abc/')).toBe(true);
    expect(isShortTikTok('https://www.tiktok.com/@a/video/1')).toBe(false);
  });
  it('trims captions', () => {
    expect(trimCaption('  best   ramen\n\nin Tokyo ')).toBe('best ramen in Tokyo');
    expect(trimCaption('x'.repeat(400))).toHaveLength(300);
    expect(trimCaption(null)).toBe('');
  });
});

describe('the AI answer', () => {
  it('keeps each place with its own city (a Tokyo video naming a Kyoto spot)', () => {
    const a = parsePlacesAnswer(JSON.stringify({ city: 'Tokyo', country: 'Japan', places: [
      { name: 'Ichiran Shibuya', kind: 'restaurant', city: 'Tokyo' }, { name: 'Gion Kappa', kind: 'bar', city: 'Kyoto' },
    ] }));
    expect(a?.places.map((p) => [p.name, p.city])).toEqual([['Ichiran Shibuya', 'Tokyo'], ['Gion Kappa', 'Kyoto']]);
  });
  it('maps an unknown kind to other and rejects garbage', () => {
    expect(parsePlacesAnswer(JSON.stringify({ city: null, country: null, places: [{ name: 'X', kind: 'spaceport', city: null }] }))?.places[0].kind).toBe('other');
    expect(parsePlacesAnswer('not json')).toBeNull();
    expect(parsePlacesAnswer(JSON.stringify({ places: 'nope' }))).toBeNull();
  });
  it('cleanPlaces drops empties, duplicates and the city or country itself, and keeps at most 10', () => {
    const a = cleanPlaces({ city: 'Tokyo', country: 'Japan', places: [
      { name: '  ', kind: 'other', city: null }, { name: 'Tokyo', kind: 'sight', city: 'Tokyo' }, { name: 'japan', kind: 'sight', city: null },
      { name: 'Café Kitsuné', kind: 'cafe', city: 'Tokyo' }, { name: 'cafe kitsune', kind: 'cafe', city: 'Tokyo' },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `Spot ${i}`, kind: 'sight' as const, city: 'Tokyo' })),
    ] });
    expect(a.places[0].name).toBe('Café Kitsuné');
    expect(a.places.filter((p) => /kitsun/i.test(p.name))).toHaveLength(1);
    expect(a.places.some((p) => /^(tokyo|japan)$/i.test(p.name))).toBe(false);
    expect(a.places).toHaveLength(10);
  });
});

describe('wishQuota', () => {
  const now = Date.parse('2026-11-06T10:15:00Z');
  const full = { videos: Array.from({ length: 20 }, (_, i) => `v${i}`) };
  it('a new video counts; the same video again is free', () => {
    const first = wishQuota({}, 'v1', false, now);
    expect(first).toMatchObject({ ok: true, counted: true });
    const again = wishQuota((first as { patch: object }).patch, 'v1', false, now);
    expect(again).toMatchObject({ ok: true, counted: false });
  });
  it('free accounts stop at 20 new videos a month; Pro does not', () => {
    expect(wishQuota(full, 'new', false, now)).toEqual({ ok: false, reason: 'monthly' });
    expect(wishQuota(full, 'v3', false, now)).toMatchObject({ ok: true, counted: false });
    expect(wishQuota(full, 'new', true, now)).toMatchObject({ ok: true, counted: true });
  });
  it('everyone stops at 30 new videos an hour', () => {
    expect(wishQuota({ hours: { '2026-11-06T10': 30 } }, 'new', true, now)).toEqual({ ok: false, reason: 'hourly' });
  });
  it('months are UTC', () => { expect(monthKey(Date.parse('2026-12-01T00:30:00Z'))).toBe('2026-12'); });
});

describe('pickByName', () => {
  const center = { lat: 35.68, lng: 139.76 };
  it('takes the result named like the place, near the city', () => {
    expect(pickByName('Ichiran Shibuya', [
      { name: 'Shibuya Station', lat: 35.658, lng: 139.701 }, { name: 'Ichiran Shibuya', lat: 35.661, lng: 139.700 },
    ], center)).toEqual({ lat: 35.661, lng: 139.700 });
  });
  it('rejects a namesake far away and a result sharing no word', () => {
    expect(pickByName('Ichiran', [{ name: 'Ichiran Fukuoka', lat: 33.59, lng: 130.4 }], center)).toBeNull();
    expect(pickByName('Gion Kappa', [{ name: 'Tokyo Tower', lat: 35.65, lng: 139.74 }], center)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest --watchAll=false __tests__/functions/socialPost.test.ts`
Expected: FAIL — cannot find module `functions/src/socialPost`.

- [ ] **Step 3: Implement `functions/src/socialPost.ts`**

```ts
/**
 * Social wish list — the server's rules (spec docs/superpowers/specs/2026-11-06-social-wishlist-design.md): TikTok
 * links, the AI's place list, the monthly limit and picking a geocoder result. Pure; socialPostFunctions.ts calls out.
 */
export type PlaceKind = 'restaurant' | 'bar' | 'cafe' | 'sight' | 'hotel' | 'activity' | 'shop' | 'other';
export interface FoundPlace { name: string; kind: PlaceKind; city: string | null }
export interface PlacesAnswer { city: string | null; country: string | null; places: FoundPlace[] }
const KINDS: PlaceKind[] = ['restaurant', 'bar', 'cafe', 'sight', 'hotel', 'activity', 'shop', 'other'];

export const isTikTokHost = (host: string) => /^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/i.test(host);

function parse(url: string): URL | null { try { return new URL(url); } catch { return null; } }

export function tiktokVideoId(url: string): string | null {
  const u = parse(url);
  if (!u || !isTikTokHost(u.hostname)) return null;
  const m = /\/video\/(\d{8,25})/.exec(u.pathname) ?? /\/v\/(\d{8,25})\.html/.exec(u.pathname);
  return m ? m[1] : null;
}

export function isShortTikTok(url: string): boolean {
  const u = parse(url);
  return !!u && isTikTokHost(u.hostname) && (/^(vm|vt)\./i.test(u.hostname) || u.pathname.startsWith('/t/'));
}

export const trimCaption = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 300) : '');

export const PLACES_SYSTEM = [
  'You read the caption of a short travel video and list the specific places it names: restaurants, bars, cafes,',
  'sights, hotels, activities, shops. Only places the text actually names — never guess from the topic. For each,',
  'its city when the text says or clearly implies it. Also the main city and country of the video, or null.',
  'At most 10 places. Names exactly as written (keep accents).',
].join(' ');

export const PLACES_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string', nullable: true }, country: { type: 'string', nullable: true },
    places: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, kind: { type: 'string', enum: KINDS }, city: { type: 'string', nullable: true },
    }, required: ['name', 'kind', 'city'] } },
  },
  required: ['city', 'country', 'places'],
};

export const placesPrompt = (caption: string, authorHandle: string) => `Creator: @${authorHandle || 'unknown'}\nCaption: ${caption || '(none)'}`;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parsePlacesAnswer(text: unknown): PlacesAnswer | null {
  let o: unknown;
  try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
  const a = o as { city?: unknown; country?: unknown; places?: unknown } | null;
  if (!a || !Array.isArray(a.places)) return null;
  return {
    city: str(a.city), country: str(a.country),
    places: a.places.map((p) => {
      const q = p as { name?: unknown; kind?: unknown; city?: unknown };
      return { name: typeof q.name === 'string' ? q.name : '', kind: KINDS.includes(q.kind as PlaceKind) ? (q.kind as PlaceKind) : 'other', city: str(q.city) };
    }),
  };
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function cleanPlaces(a: PlacesAnswer): PlacesAnswer {
  const seen = new Set<string>();
  const banned = new Set([a.city, a.country].filter((x): x is string => !!x).map(fold));
  const places: FoundPlace[] = [];
  for (const p of a.places) {
    const name = p.name.replace(/\s+/g, ' ').trim().slice(0, 120);
    const key = fold(name);
    if (!key || banned.has(key) || seen.has(key)) continue;
    seen.add(key);
    places.push({ ...p, name });
    if (places.length === 10) break;
  }
  return { ...a, places };
}

export const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);
export const hourKey = (ms: number) => new Date(ms).toISOString().slice(0, 13);
export type QuotaDoc = { videos?: string[]; hours?: Record<string, number> };
export const FREE_MONTHLY = 20;
export const HOURLY = 30;

export function wishQuota(doc: QuotaDoc, videoId: string, paid: boolean, nowMs: number):
  { ok: true; counted: boolean; patch: QuotaDoc } | { ok: false; reason: 'monthly' | 'hourly' } {
  const videos = doc.videos ?? [];
  if (videos.includes(videoId)) return { ok: true, counted: false, patch: doc };
  const h = hourKey(nowMs);
  const inHour = doc.hours?.[h] ?? 0;
  if (inHour >= HOURLY) return { ok: false, reason: 'hourly' };
  if (!paid && videos.length >= FREE_MONTHLY) return { ok: false, reason: 'monthly' };
  return { ok: true, counted: true, patch: { videos: [...videos, videoId], hours: { [h]: inHour + 1 } } };
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}

/** The geocoder result named like the place (shares its words) within `maxKm` of the city, else null. */
export function pickByName(name: string, features: { name: string; lat: number; lng: number }[], center: { lat: number; lng: number } | null, maxKm = 25): { lat: number; lng: number } | null {
  const want = fold(name).split(' ').filter((w) => w.length > 2);
  if (!want.length) return null;
  const scored = features
    .filter((f) => !center || km(center, f) <= maxKm)
    .map((f) => { const have = new Set(fold(f.name).split(' ')); return { f, hits: want.filter((w) => have.has(w)).length }; })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0] ? { lat: scored[0].f.lat, lng: scored[0].f.lng } : null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest --watchAll=false __tests__/functions/socialPost.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit** `feat(wishlist): server rules for TikTok links, AI places, limits`.

### Task 2: `readSocialPost` callable, rules, deletion, privacy

**Files:**
- Create: `functions/src/socialPostFunctions.ts`
- Modify: `functions/src/index.ts` (export), `firestore.rules` (wishlist owner rules; `socialPosts` stays unmatched = denied), `hosting/privacy.html` (one sentence under the service list)

**Interfaces:** Consumes Task 1. Produces callable `readSocialPost({ url: string; requestId: string })` →
```ts
{ videoId: string; postUrl: string; caption: string; author: string; authorHandle: string; coverUrl: string | null;
  city: string | null; country: string | null; cityLat: number | null; cityLng: number | null;
  places: { id: string; name: string; kind: PlaceKind; city: string | null; countryCode: string | null; lat: number | null; lng: number | null }[] }
```
Errors: `invalid-argument` (not TikTok / unreadable), `not-found` (private/deleted), `failed-precondition` (no consent), `resource-exhausted` with `details.reason` `'monthly' | 'hourly'`.

- [ ] **Step 1: Implement** — follow `pastTripStoryFunctions.ts` exactly for auth, consent and the transaction:
  1. Validate `url` string ≤ 500, `requestId` `/^[A-Za-z0-9_-]{6,40}$/`. If `isShortTikTok(url)`: `fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0' } })`, use `res.url`; require `tiktokVideoId(final)`.
  2. Consent: `hasAiConsent(user, 'agent')`.
  3. Quota transaction on `usage_quotas/{uid}/wishlist/{monthKey(now)}` with `wishQuota(doc, videoId, isPaidTier(tier), now)`; on `ok:false` throw `resource-exhausted` (`'Free accounts save 20 places a month. Pro saves as many as you like.'` / `'That's a lot of saving. Try again in a few minutes.'`), `{ reason }`. Write `patch` with `merge`.
  4. Cache `socialPosts/{videoId}` (`{ answer, caption, author, authorHandle, cityLat, cityLng, places, at }`) younger than 30 days → skip 5–6.
  5. oEmbed `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}` (5 s); 400/404 → `not-found`. Fields `title`, `author_name`, `author_unique_id`, `thumbnail_url`.
  6. `generateJson({ system: PLACES_SYSTEM, turns: [{ role: 'user', text: placesPrompt(caption, handle) }], schema: PLACES_SCHEMA, apiKey, thinkingBudget: 0, parse: parsePlacesAnswer })` → `cleanPlaces`. Without `GEMINI_API_KEY` or on failure: `{ city: null, country: null, places: [] }` (the sheet offers Add a place by name). Log tokens.
  7. Mapbox (`process.env.MAPBOX_TOKEN`): city centre `GET https://api.mapbox.com/search/geocode/v6/forward?q=${city, country}&types=place&limit=1&access_token=…`; each place `…/forward?q=${name}, ${place.city ?? city}&proximity=${lng},${lat}&limit=5&access_token=…` → features `{ name: properties.name, lat: geometry.coordinates[1], lng: geometry.coordinates[0] }` → `pickByName(name, features, placeCityCentre)`; a place in another city geocodes that city first (memoised per city). `countryCode` from `properties.context.country.country_code` upper-cased. 5 s timeouts; failures leave lat/lng null.
  8. Save cache (Admin SDK); return the shape above with `coverUrl` from oEmbed (never stored) and ids `p1…pN`.
- [ ] **Step 2: Rules** — inside `match /users/{uid}`:
```
match /wishlist/{videoId} {
  allow read, delete: if isOwner(uid);
  allow create, update: if isOwner(uid)
    && request.resource.data.keys().hasOnly(['platform','videoId','postUrl','author','authorHandle','caption','city','country','cityLat','cityLng','savedAt','places'])
    && request.resource.data.platform == 'tiktok' && request.resource.data.videoId == videoId
    && request.resource.data.caption is string && request.resource.data.caption.size() <= 300
    && request.resource.data.places is list && request.resource.data.places.size() <= 10;
}
```
- [ ] **Step 3: Privacy** — under the service list in `hosting/privacy.html` add: `<li><strong>TikTok</strong> receives the link of a post you share to Supernova, to look up that public post. Google's Gemini API reads the post's public caption to find the places it names. Nothing about you is sent with them, and your wish list is private.</li>`
- [ ] **Step 4:** `(cd functions && npm run build)`; `npx jest --watchAll=false` → all pass. Commit `feat(wishlist): readSocialPost callable, wish list rules, privacy`.

### Task 3: App rules (pure)

**Files:** Create `utils/wishlist.ts`; Test `__tests__/utils/wishlist.test.ts`

**Interfaces — Produces:**
```ts
export type WishKind = 'restaurant' | 'bar' | 'cafe' | 'sight' | 'hotel' | 'activity' | 'shop' | 'other';
export interface WishPlace { id: string; name: string; kind: WishKind; city: string | null; countryCode: string | null; lat: number | null; lng: number | null; addedTo?: { tripId: string; dayId: string; activityId: string } }
export interface WishSave { videoId: string; platform: 'tiktok'; postUrl: string; author: string; authorHandle: string; caption: string; city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; savedAtMs: number; places: WishPlace[] }
export interface TripForMatch { id: string; title: string; start: string | null; end: string | null; cities: { name: string; lat: number | null; lng: number | null }[] }
export function tiktokUrlFromShare(text: string): string | null;
export function wishMatches(trip: TripForMatch, saves: WishSave[], today: string, km?: number): { save: WishSave; place: WishPlace }[];
export function fitsTrip(place: Pick<WishPlace, 'lat' | 'lng'>, trips: TripForMatch[], today: string, km?: number): TripForMatch | null;
export function kindToActivityType(kind: WishKind): 'restaurant' | 'hotel' | 'activity';
export function wishlistByCity(saves: WishSave[]): { city: string; places: { save: WishSave; place: WishPlace | null }[] }[];
export function wishlistDoc(preview: WishSave, keepIds: string[], extra: WishPlace[]): Omit<WishSave, 'savedAtMs'>;
```

- [ ] **Step 1: Failing tests**

```ts
import { tiktokUrlFromShare, wishMatches, fitsTrip, kindToActivityType, wishlistByCity, wishlistDoc, type WishSave, type TripForMatch } from '@/utils/wishlist';

const place = (id: string, name: string, lat: number | null, lng: number | null, city = 'Tokyo') => ({ id, name, kind: 'restaurant' as const, city, countryCode: 'JP', lat, lng });
const save = (videoId: string, places: ReturnType<typeof place>[], city: string | null = 'Tokyo', savedAtMs = 1): WishSave => ({
  videoId, platform: 'tiktok', postUrl: `https://www.tiktok.com/@a/video/${videoId}`, author: 'A', authorHandle: 'a', caption: '', city, country: 'Japan', cityLat: 35.68, cityLng: 139.76, savedAtMs, places,
});
const tokyo: TripForMatch = { id: 't', title: 'Tokyo trip', start: '2026-12-01', end: '2026-12-07', cities: [{ name: 'Tokyo', lat: 35.68, lng: 139.76 }] };
const kyoto: TripForMatch = { id: 'k', title: 'Kyoto trip', start: '2026-12-08', end: '2026-12-10', cities: [{ name: 'Kyoto', lat: 35.01, lng: 135.77 }] };

describe('tiktokUrlFromShare', () => {
  it('finds the link among other words', () => {
    expect(tiktokUrlFromShare('Check this out https://vm.tiktok.com/ZM8xAbc/ #tokyo')).toBe('https://vm.tiktok.com/ZM8xAbc/');
    expect(tiktokUrlFromShare('https://www.tiktok.com/@foodie/video/7300000000000000001?_r=1')).toBe('https://www.tiktok.com/@foodie/video/7300000000000000001?_r=1');
  });
  it('ignores other sites and look-alikes', () => {
    expect(tiktokUrlFromShare('https://www.instagram.com/reel/abc/')).toBeNull();
    expect(tiktokUrlFromShare('https://tiktok.com.evil.io/x')).toBeNull();
    expect(tiktokUrlFromShare('no link here')).toBeNull();
  });
});

describe('matching trips by distance', () => {
  const shibuya = place('p1', 'Ichiran Shibuya', 35.66, 139.70);
  const gion = place('p2', 'Gion Kappa', 35.0037, 135.7788, 'Kyoto');
  const s = save('v1', [shibuya, gion]);
  it('a place within 50 km of a trip city matches it (Shibuya → Tokyo), another city\'s place does not', () => {
    expect(wishMatches(tokyo, [s], '2026-11-06').map((m) => m.place.name)).toEqual(['Ichiran Shibuya']);
    expect(wishMatches(kyoto, [s], '2026-11-06').map((m) => m.place.name)).toEqual(['Gion Kappa']);
  });
  it('an ended trip matches nothing; a current one does', () => {
    expect(wishMatches(tokyo, [s], '2026-12-08')).toEqual([]);
    expect(wishMatches(tokyo, [s], '2026-12-03')).toHaveLength(1);
  });
  it('places without a position never match', () => {
    expect(wishMatches(tokyo, [save('v2', [place('p3', 'Somewhere', null, null)])], '2026-11-06')).toEqual([]);
  });
  it('fitsTrip names the nearest upcoming trip', () => {
    expect(fitsTrip(gion, [tokyo, kyoto], '2026-11-06')?.id).toBe('k');
    expect(fitsTrip({ lat: 48.85, lng: 2.35 }, [tokyo, kyoto], '2026-11-06')).toBeNull();
  });
});

it('kindToActivityType', () => {
  expect(['restaurant', 'bar', 'cafe'].map((k) => kindToActivityType(k as never))).toEqual(['restaurant', 'restaurant', 'restaurant']);
  expect(kindToActivityType('hotel')).toBe('hotel');
  expect(kindToActivityType('sight')).toBe('activity');
});

it('wishlistByCity groups by place city, newest save first, posts without places under their city or Somewhere', () => {
  const g = wishlistByCity([
    save('old', [place('a', 'Old spot', 35.6, 139.7)], 'Tokyo', 1),
    save('new', [place('b', 'Gion Kappa', 35.0, 135.7, 'Kyoto')], 'Tokyo', 3),
    save('none', [], null, 2),
  ]);
  expect(g.map((x) => x.city)).toEqual(['Kyoto', 'Somewhere', 'Tokyo']);
  expect(g[1].places[0].place).toBeNull();
});

it('wishlistDoc keeps the ticked places plus ones added by name', () => {
  const s = save('v', [place('p1', 'A', 1, 1), place('p2', 'B', 2, 2)]);
  const d = wishlistDoc(s, ['p2'], [place('x1', 'Typed', 3, 3)]);
  expect(d.places.map((p) => p.name)).toEqual(['B', 'Typed']);
  expect(d).not.toHaveProperty('savedAtMs');
});
```

- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3: Implement** (`utils/wishlist.ts`): `tiktokUrlFromShare` = first `https?://\S+` whose `new URL(..).hostname` matches `/^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/i`, trailing `)`/`.`/`,` trimmed; `km` haversine; `active(trip, today)` = `!trip.end || trip.end >= today` (undated trips count as upcoming); `wishMatches` = for active trips, places with lat/lng within `km` (default 50) of any city with coordinates; `fitsTrip` = the active trip with the nearest city within 50 km; `kindToActivityType` per test; `wishlistByCity` = rows keyed by `place.city ?? save.city ?? 'Somewhere'`, a save with no places contributes `{ save, place: null }`, groups ordered by their newest `savedAtMs` desc; `wishlistDoc` = `{ ...preview without savedAtMs, places: [...preview.places.filter(p => keepIds.includes(p.id)), ...extra].slice(0, 10) }`.
- [ ] **Step 4:** Run → PASS. Commit `feat(wishlist): app rules — share links, trip matching, grouping`.

### Task 4: Data layer — services and hook

**Files:** Create `services/socialPost.ts`, `services/pendingShare.ts`, `hooks/useWishlist.ts`

**Interfaces:** Produces
```ts
// services/socialPost.ts
export async function readSocialPost(url: string): Promise<WishSave>;          // httpsCallable('readSocialPost') with a Firestore auto-id requestId; savedAtMs: Date.now()
export async function tiktokCover(postUrl: string): Promise<string | null>;  // fetch https://www.tiktok.com/oembed?url=…; thumbnail_url; memoised per session
// services/pendingShare.ts
export async function setPendingShare(url: string): Promise<void>; export async function takePendingShare(): Promise<string | null>; // AsyncStorage 'pendingShare'
// hooks/useWishlist.ts
export function useWishlist(): { saves: WishSave[]; isLoading: boolean; save(doc: Omit<WishSave,'savedAtMs'>): Promise<void>; remove(videoId: string): Promise<void>; removePlace(videoId: string, placeId: string): Promise<void>; markAdded(videoId: string, placeId: string, addedTo: { tripId: string; dayId: string; activityId: string }): Promise<void> };
```
- [ ] Implement: query key `['wishlist', uid]`, `getDocs(collection(db,'users',uid,'wishlist'))` mapped with `savedAtMs = savedAt.toMillis()`; `save` = `setDoc(doc(…, videoId), { ...doc, savedAt: serverTimestamp() })` guarded by `requireOnline()`; `removePlace` / `markAdded` rewrite `places` with `updateDoc`; each mutation invalidates the key. Typecheck; commit `feat(wishlist): data layer`.

### Task 5: Share target

**Files:** Modify `package.json` (`npx expo install expo-share-intent@~5.1.0`), `app.json` (plugin), `app/_layout.tsx` (provider if the library requires one), Create `hooks/useShareIntentRouting.ts`, Modify `app/(tabs)/_layout.tsx` (mount)

- [ ] Add plugin `["expo-share-intent", { "iosActivationRules": { "NSExtensionActivationSupportsWebURLWithMaxCount": 1, "NSExtensionActivationSupportsText": true }, "androidIntentFilters": ["text/*"] }]` — check the 5.1 README for the exact option names before writing.
- [ ] `useShareIntentRouting`: on a share (`useShareIntentContext`/`useShareIntent` per the 5.1 API) take `webUrl ?? text`; `tiktokUrlFromShare` → if signed in and online `router.push({ pathname: '/wishlist/save', params: { url } })`, else `setPendingShare(url)`; on the tabs layout mount, `takePendingShare()` → open the sheet. Non-TikTok share → `Alert.alert('Supernova can save TikTok posts for now')`. Reset the intent after handling.
- [ ] Typecheck + full jest; commit `feat(wishlist): receive TikTok shares`.

### Task 6: Save sheet

**Files:** Create `app/wishlist/save.tsx` (route, `presentation: 'modal'` in `app/_layout.tsx`), `components/wishlist/WishPlaceRow.tsx`

- [ ] Screen states: loading ("Reading the post" + star animation-lite: `ActivityIndicator` + caption), error (messages per spec §3; `resource-exhausted` monthly → `useLimitPaywall()`; consent → `useAiConsentGate().requireConsent('agent', retry)`), result: cover (`tiktokCover` with `expo-image`), creator, caption, rows (`WishPlaceRow`: check toggle, type icon via a `WISH_KIND_ICONS` map in `constants/icons.ts`, name, city, "Fits your {trip}" from `fitsTrip` over `useMyTrips()` mapped to `TripForMatch`), "No places named in this post" + **Add a place by name** (inline field → `searchPlaceInBounds(name, cityBox, cityCentre)` from `services/places/mapboxSearch.ts`), primary **Save** → `wishlistDoc` → `useWishlist().save` → Success haptic → "Saved to your wish list" → `router.back()`.
- [ ] Wrap the scroll in `KeyboardLift`; design checklist in the commit message body. Commit `feat(wishlist): save sheet`.

### Task 7: Profile Wish list + saved place screen

**Files:** Modify `app/(tabs)/profile.tsx` (filter `'Wish list'` after Past; renders `components/wishlist/WishlistList.tsx` instead of trip cards when selected), Create `components/wishlist/WishlistList.tsx`, `app/wishlist/[id].tsx`

- [ ] `WishlistList`: FlashList over `wishlistByCity(saves)` (eyebrow `TOKYO · 6 PLACES`, rows with type icon + name + "from @handle", check when `addedTo`), header field **Paste a link** (`tiktokUrlFromShare` → `/wishlist/save`), empty state (MapPin icon, "Save places from TikTok", "On TikTok, tap Share, then Supernova. Places land here, ready for your next trip.", primary Paste a link).
- [ ] `app/wishlist/[id].tsx` (`id` = videoId, `?place=` optional): cover (fresh), creator, caption, place list with **Add to a trip** (trip picker of `fitsTrip`-ordered upcoming trips → `DayPickerSheet` → add stop as Task 8) and remove; **Watch on TikTok** (`Linking.openURL(postUrl)`), delete save (confirm).
- [ ] Commit `feat(wishlist): profile wish list and saved place screen`.

### Task 8: Trip chip and add to a day

**Files:** Create `components/wishlist/TripWishlistSheet.tsx`, `services/wishlistToTrip.ts`; Modify `app/trip/[id].tsx` (chip after Packing, members only, when `wishMatches(...)` is non-empty)

- [ ] `addWishToDay(trip, dayId, place, save)`: `useCreateTrip().addActivity(trip.id, dayId, { type: kindToActivityType(place.kind), title: place.name, titleSource: 'user', placeId: null, placeName: place.name, address: null, lat: place.lat, lng: place.lng, searchQuery: \`${place.name}, ${place.city ?? save.city ?? ''}\`, startTime: null, endTime: null, durationMinutes: null, notes: '', bookingRef: null, cost: null, currency: null, mediaUrls: [], createdAt: Timestamp.now(), visited: false, visitedAt: null, groundingFailedAt: null })` → `markAdded`.
- [ ] Chip `Wish list · N` (Heart duotone) → sheet listing matches (row → Add to a day → `DayPickerSheet`), added rows checked. Medium haptic on add.
- [ ] Commit `feat(wishlist): trip chip, add places to a day`.

### Task 9: Docs and final checks

- [ ] CLAUDE.md: a **Social wish list** bullet (files, limits, privacy, cost, TikTok-only, store-build need), `readSocialPost` under Cloud Functions, Firestore collections `users/{uid}/wishlist` and `socialPosts`.
- [ ] `npx tsc --noEmit -p .`, `(cd functions && npx tsc --noEmit)`, `npx jest --watchAll=false`, eslint on changed files. Commit `docs(wishlist)`.
