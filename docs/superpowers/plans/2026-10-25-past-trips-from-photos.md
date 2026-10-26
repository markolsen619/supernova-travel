# Past Trips From Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone picks a past trip's photos and gets a Supernova trip — days, placed stops, photos on each stop's journal, a title and captions from Nova — reviewed before it's saved.

**Architecture:** Photos are read and grouped on the phone by pure functions (`utils/photoMeta.ts`, `utils/pastTrip.ts`, `utils/pastTripEdits.ts`, `utils/pastTripDocs.ts`). Stops are named by Mapbox (`services/pastTripPlaces.ts`); one new callable, `pastTripStory`, writes the words from names and times only. `services/pastTrip.ts` writes the trip, then the days and stops in one batch, then uploads re-encoded photos to each stop's journal. One modal route, `app/trip/past.tsx`, holds the whole flow (intro → building → review → finish) so the draft stays in memory.

**Tech Stack:** Expo SDK 54, expo-image-picker 17 (`exif: true`), expo-image-manipulator, Firebase JS SDK (Firestore, Storage, Functions), Firebase Functions v2 (Node 22, TypeScript), Gemini 2.5 Flash via `functions/src/agentModel.ts`, Mapbox Search Box + Geocoding v6, Jest.

**Spec:** `docs/superpowers/specs/2026-10-25-past-trips-from-photos-design.md`

## Global Constraints

- Photos: the normal picker, multi-select, **≤ 100**; never full photo-library access.
- Stop rule: new stop when the next photo is **> 250 m** from the current stop's centre or **> 90 min** after its last photo.
- City rule: a stop **> 50 km** from the current city starts a new city.
- Place name: nearest named place **≤ 100 m**, else the neighbourhood.
- Photos per stop: **≤ 10** (`MAX_JOURNAL_PHOTOS` 5 → 10 everywhere).
- Photo times: EXIF `DateTimeOriginal` as printed (local), never converted.
- Nothing leaves the phone but re-encoded photos (no metadata, no location) and, to Nova, city/stop names and times. Never coordinates to Nova.
- Nova: one message of the shared monthly allowance (`agentQuotaPolicy`), charged only on success, AI consent purpose `agent`. Declined or failed → "Trip to {city}", empty captions, saving still works.
- Free for every tier.
- Visibility picked on review, **Followers** by default.
- Copy (supernova-design): sentence case, no "!", no emoji, verb-first buttons. Screen titles/strings exactly as in the spec ("Add a trip you've taken", "Turn your photos into a trip", "Building your trip", "Unplaced photos", "Save trip", "Your {city} trip is saved.", "Make the video", "Post to the feed", "View trip", "Discard this trip?", "These photos don't say where they were taken", "Connect to the internet to build a trip").
- UI: `useTheme()` colors only (no hex in `StyleSheet.create`), Phosphor icons, ≥ 44 pt targets with `accessibilityLabel`, haptics (Light select, Medium create), house spring `tension: 65, friction: 11`, FlashList for long lists, one primary action per screen.
- Writes refused offline: `requireOnline()` from `services/offline.ts`.
- Server pieces deploy before the app (`pastTripStory`, `onTripWrittenTrend`).
- Commit trailer on every commit:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01GW6nHj9fLvq4aTve1m9fqj`.
- Never start an EAS build or deploy without the owner's go-ahead in chat (Task 12).

## Spec corrections made while planning (tell the owner)

1. **Booking matching is left alone.** The spec says matching should never link a booking to a trip that has ended. Matching links only on overlapping dates, so the only bookings that can match a past trip are bookings *from* that trip (an old hotel email forwarded later) — linking them is right. No task changes `bookingMatch.ts`.
2. **One batch for days and stops, the trip doc first.** Firestore rules check a day/stop write with `get()` on its parent trip, which can't see a trip created in the same batch. `savePastTrip` creates the trip doc, then writes all days and stops in one batch, and deletes the trip doc if that batch fails — still all or nothing for the person.
3. **"Drag" is a tap-then-pick.** Moving a photo or an unplaced photo onto a stop is: long-press (or tap, in the tray) → "Move to…" list of stops. Dragging across a scrolling list is fragile and inaccessible.

## Review Focus

1. **Photos from two phones or time zones in one trip** (a friend's AirDropped photos with another `OffsetTimeOriginal`): days still follow each photo's printed date; nothing crashes; stops order by printed time.
2. **Photos picked out of order and duplicates** (the same photo picked twice by id): sorted by time, a duplicate id counted once.
3. **A stop whose Mapbox lookup fails or returns nothing**: it still saves, named after the neighbourhood, else "Stop {n}".
4. **App backgrounded or killed during upload**: the trip, days and stops already exist; failed photos are reported on the finish screen and retryable; nothing is uploaded twice to one journal on retry.
5. **Trip of one day, one city** (the common case): no `nights` written (single-city trips stay unchanged), `endDate === startDate`.

Each line has a test in the owning task (Tasks 2, 2, 7, 8, 8).

---

### Task 1: Read when and where a photo was taken

**Files:**
- Create: `utils/photoMeta.ts`
- Test: `__tests__/utils/photoMeta.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PhotoMeta { day: string | null; minutes: number | null; lat: number | null; lng: number | null }
  export function photoMeta(exif: Record<string, unknown> | null | undefined): PhotoMeta
  ```
  `day` is `YYYY-MM-DD` as printed, `minutes` is minutes after midnight as printed.

- [ ] **Step 1: Write the failing test**

```ts
import { photoMeta } from '@/utils/photoMeta';

describe('photoMeta', () => {
  it('reads iOS picker EXIF (nested {Exif}/{GPS})', () => {
    const m = photoMeta({
      '{Exif}': { DateTimeOriginal: '2025:05:03 14:22:10', OffsetTimeOriginal: '+01:00' },
      '{GPS}': { Latitude: 38.7139, LatitudeRef: 'N', Longitude: 9.1335, LongitudeRef: 'W' },
    });
    expect(m).toEqual({ day: '2025-05-03', minutes: 14 * 60 + 22, lat: 38.7139, lng: -9.1335 });
  });
  it('reads Android picker EXIF (flat, rational GPS strings)', () => {
    const m = photoMeta({
      DateTimeOriginal: '2025:05:04 09:05:00',
      GPSLatitude: '38/1,42/1,5004/100', GPSLatitudeRef: 'N',
      GPSLongitude: '9/1,8/1,96/1', GPSLongitudeRef: 'W',
    });
    expect(m.day).toBe('2025-05-04');
    expect(m.minutes).toBe(9 * 60 + 5);
    expect(m.lat).toBeCloseTo(38.7139, 3);
    expect(m.lng).toBeCloseTo(-9.1433, 3);
  });
  it('reads flat decimal GPS numbers', () => {
    expect(photoMeta({ DateTimeOriginal: '2025:05:04 09:05:00', GPSLatitude: 51.5, GPSLatitudeRef: 'N', GPSLongitude: 0.12, GPSLongitudeRef: 'W' }).lng).toBeCloseTo(-0.12);
  });
  it('falls back to DateTime when DateTimeOriginal is missing', () => {
    expect(photoMeta({ DateTime: '2025:05:04 23:59:59' }).day).toBe('2025-05-04');
  });
  it('a screenshot (no EXIF) has nothing', () => {
    expect(photoMeta(null)).toEqual({ day: null, minutes: null, lat: null, lng: null });
    expect(photoMeta({})).toEqual({ day: null, minutes: null, lat: null, lng: null });
  });
  it('rejects 0,0 and out-of-range coordinates and malformed dates', () => {
    expect(photoMeta({ '{GPS}': { Latitude: 0, Longitude: 0 } }).lat).toBeNull();
    expect(photoMeta({ '{GPS}': { Latitude: 120, Longitude: 10 } }).lat).toBeNull();
    expect(photoMeta({ DateTimeOriginal: '0000:00:00 00:00:00' }).day).toBeNull();
    expect(photoMeta({ DateTimeOriginal: 'yesterday' }).day).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/photoMeta.test.ts`
Expected: FAIL — "Cannot find module '@/utils/photoMeta'"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * When and where a picked photo was taken, from the picker's EXIF (expo-image-picker `exif: true`).
 * iOS nests `{Exif}` / `{GPS}`; Android is flat with rational strings. Times are as printed — never converted
 * (spec 2026-10-25-past-trips-from-photos). Coordinates stay on the phone: they only group and name stops.
 */
export interface PhotoMeta { day: string | null; minutes: number | null; lat: number | null; lng: number | null }

const NONE: PhotoMeta = { day: null, minutes: null, lat: null, lng: null };

function rationalOrNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return null;
  const parts = v.split(',').map((p) => {
    const [n, d] = p.trim().split('/').map(Number);
    return d ? n / d : n;
  });
  if (parts.some((p) => !Number.isFinite(p))) return null;
  const [deg = 0, min = 0, sec = 0] = parts;
  return parts.length === 1 ? deg : deg + min / 60 + sec / 3600;
}

function signed(value: number | null, ref: unknown, negative: string): number | null {
  if (value === null) return null;
  return typeof ref === 'string' && ref.toUpperCase() === negative ? -Math.abs(value) : value;
}

function printedTime(v: unknown): { day: string; minutes: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return { day: `${m[1]}-${m[2]}-${m[3]}`, minutes: h * 60 + mi };
}

export function photoMeta(exif: Record<string, unknown> | null | undefined): PhotoMeta {
  if (!exif || typeof exif !== 'object') return { ...NONE };
  const ex = (exif['{Exif}'] as Record<string, unknown> | undefined) ?? exif;
  const gps = exif['{GPS}'] as Record<string, unknown> | undefined;
  const t = printedTime(ex.DateTimeOriginal) ?? printedTime(exif.DateTimeOriginal) ?? printedTime(exif.DateTime)
    ?? printedTime((exif['{TIFF}'] as Record<string, unknown> | undefined)?.DateTime);
  const lat = gps ? signed(rationalOrNumber(gps.Latitude), gps.LatitudeRef, 'S') : signed(rationalOrNumber(exif.GPSLatitude), exif.GPSLatitudeRef, 'S');
  const lng = gps ? signed(rationalOrNumber(gps.Longitude), gps.LongitudeRef, 'W') : signed(rationalOrNumber(exif.GPSLongitude), exif.GPSLongitudeRef, 'W');
  const located = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  return { day: t?.day ?? null, minutes: t?.minutes ?? null, lat: located ? lat : null, lng: located ? lng : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/photoMeta.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/photoMeta.ts __tests__/utils/photoMeta.test.ts
git commit -m "feat(past-trips): read when and where a photo was taken"
```

---

### Task 2: Build days, stops and cities from photos

**Files:**
- Create: `utils/pastTrip.ts`
- Test: `__tests__/utils/pastTrip.test.ts`

**Interfaces:**
- Consumes: `PhotoMeta` (Task 1); `haversineMeters` from `@/utils/tripRoutes`.
- Produces:
  ```ts
  export interface PickedPhoto { id: string; uri: string; meta: PhotoMeta }
  export interface DraftStop { id: string; lat: number; lng: number; time: string; photoIds: string[]; shownIds: string[]; name: string; placeName: string | null; type: 'activity' | 'restaurant' | 'hotel' }
  export interface DraftDay { day: string; city: number; caption: string; stops: DraftStop[] }
  export interface DraftCity { lat: number; lng: number; name: string; countryCode: string | null }
  export interface PastTripDraft { title: string; description: string; days: DraftDay[]; cities: DraftCity[]; unplaced: string[]; coverId: string | null; photos: Record<string, PickedPhoto> }
  export const STOP_GAP_M = 250, STOP_GAP_MIN = 90, CITY_GAP_M = 50_000, MAX_STOP_PHOTOS = 10, MAX_PICK = 100, MAX_SPAN_DAYS = 60;
  export function buildPastTrip(photos: PickedPhoto[]): PastTripDraft
  export function spanDays(photos: PickedPhoto[]): number
  export function shownPhotos(ids: string[], photos: Record<string, PickedPhoto>, max?: number): string[]
  export function coverPhoto(days: DraftDay[]): string | null
  export function pastTripNights(dayCities: number[], cityCount: number): number[]
  export function addDays(day: string, n: number): string
  ```
  Names (`name`, `placeName`, `type`, city `name`/`countryCode`) start empty and are filled by Task 7.

- [ ] **Step 1: Write the failing test**

```ts
import { buildPastTrip, coverPhoto, pastTripNights, shownPhotos, spanDays, type PickedPhoto } from '@/utils/pastTrip';

let n = 0;
const p = (day: string | null, hhmm: string | null, lat: number | null, lng: number | null, id = `p${n++}`): PickedPhoto => ({
  id, uri: `file://${id}.jpg`,
  meta: { day, minutes: hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null, lat, lng },
});
// Lisbon, Alfama ~ (38.7115,-9.1300); Baixa ~1.3 km away (38.7100,-9.1450); Porto ~275 km north.
const ALFAMA = [38.7115, -9.13] as const;
const BAIXA = [38.71, -9.145] as const;
const PORTO = [41.1496, -8.611] as const;

describe('buildPastTrip', () => {
  it('one day, two places far apart → two stops, times as printed', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-03', '10:20', ...ALFAMA), p('2025-05-03', '12:00', ...BAIXA)]);
    expect(d.days).toHaveLength(1);
    expect(d.days[0].stops.map((s) => [s.time, s.photoIds.length])).toEqual([['10:00', 2], ['12:00', 1]]);
  });
  it('same place but more than 90 min later → a new stop', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-03', '11:45', ...ALFAMA)]);
    expect(d.days[0].stops).toHaveLength(2);
  });
  it('photos picked out of order are sorted by time; a duplicate id counts once', () => {
    const a = p('2025-05-03', '12:00', ...BAIXA, 'dup');
    const d = buildPastTrip([a, p('2025-05-03', '10:00', ...ALFAMA), a]);
    expect(d.days[0].stops.map((s) => s.time)).toEqual(['10:00', '12:00']);
    expect(d.days[0].stops[1].photoIds).toEqual(['dup']);
  });
  it('days between with no photos stay as empty days', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-05', '10:00', ...ALFAMA)]);
    expect(d.days.map((x) => [x.day, x.stops.length])).toEqual([['2025-05-03', 1], ['2025-05-04', 0], ['2025-05-05', 1]]);
  });
  it('a night out across midnight splits by printed date', () => {
    const d = buildPastTrip([p('2025-05-03', '23:30', ...BAIXA), p('2025-05-04', '00:20', ...BAIXA)]);
    expect(d.days.map((x) => x.stops.length)).toEqual([1, 1]);
  });
  it('photos from another phone with another time zone still go by their printed date and time', () => {
    const d = buildPastTrip([p('2025-05-03', '09:00', ...ALFAMA), p('2025-05-03', '08:30', ...ALFAMA)]);
    expect(d.days[0].stops[0].time).toBe('08:30');
  });
  it('more than 50 km away starts a new city, and the day takes its first stop\'s city', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-05', '10:00', ...PORTO)]);
    expect(d.cities).toHaveLength(2);
    expect(d.days.map((x) => x.city)).toEqual([0, 0, 1]);
  });
  it('photos without a location (or a time) go to unplaced; dated ones still set the trip dates', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-04', '10:00', null, null, 'shot'), p(null, null, null, null, 'scr')]);
    expect(d.unplaced).toEqual(['shot', 'scr']);
    expect(d.days.map((x) => x.day)).toEqual(['2025-05-03', '2025-05-04']);
  });
  it('no photo has a location → days from the dates, no stops, no cities, everything unplaced', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', null, null, 'a'), p('2025-05-04', '10:00', null, null, 'b')]);
    expect(d.days.map((x) => x.stops.length)).toEqual([0, 0]);
    expect(d.cities).toEqual([]);
    expect(d.unplaced).toEqual(['a', 'b']);
  });
  it('nothing dated at all → no days', () => {
    expect(buildPastTrip([p(null, null, null, null)]).days).toEqual([]);
  });
});

describe('shownPhotos', () => {
  it('keeps at most 10, spread across the visit', () => {
    const photos: Record<string, PickedPhoto> = {};
    const ids = Array.from({ length: 14 }, (_, i) => { const x = p('2025-05-03', `10:${String(i).padStart(2, '0')}`, ...ALFAMA, `s${i}`); photos[x.id] = x; return x.id; });
    const shown = shownPhotos(ids, photos);
    expect(shown).toHaveLength(10);
    expect(shown[0]).toBe('s0');
    expect(shown[9]).toBe('s13');
  });
  it('10 or fewer: all', () => {
    expect(shownPhotos(['a', 'b'], {})).toEqual(['a', 'b']);
  });
});

describe('coverPhoto, spanDays, pastTripNights', () => {
  it('cover = the first photo of the stop with the most photos', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA, 'one'), p('2025-05-03', '12:00', ...BAIXA, 'two'), p('2025-05-03', '12:05', ...BAIXA, 'three')]);
    expect(coverPhoto(d.days)).toBe('two');
  });
  it('span in days, inclusive', () => {
    expect(spanDays([p('2025-05-03', '10:00', null, null), p('2025-07-10', '10:00', null, null)])).toBe(69);
  });
  it('nights: days per city, the last city loses its departure day', () => {
    expect(pastTripNights([0, 0, 0, 1, 1], 2)).toEqual([3, 1]);
    expect(pastTripNights([0, 0, 1], 2)).toEqual([2, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/pastTrip.test.ts`
Expected: FAIL — "Cannot find module '@/utils/pastTrip'"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * A past trip from its photos (spec 2026-10-25-past-trips-from-photos): days are printed dates, stops break at
 * > 250 m or > 90 min, cities at > 50 km. Pure — the review screen edits the draft (utils/pastTripEdits) and
 * services/pastTrip saves it.
 */
import type { PhotoMeta } from '@/utils/photoMeta';
import { haversineMeters } from '@/utils/tripRoutes';

export interface PickedPhoto { id: string; uri: string; meta: PhotoMeta }
export interface DraftStop {
  id: string; lat: number; lng: number; time: string; photoIds: string[]; shownIds: string[];
  name: string; placeName: string | null; type: 'activity' | 'restaurant' | 'hotel';
}
export interface DraftDay { day: string; city: number; caption: string; stops: DraftStop[] }
export interface DraftCity { lat: number; lng: number; name: string; countryCode: string | null }
export interface PastTripDraft {
  title: string; description: string; days: DraftDay[]; cities: DraftCity[];
  unplaced: string[]; coverId: string | null; photos: Record<string, PickedPhoto>;
}

export const STOP_GAP_M = 250;
export const STOP_GAP_MIN = 90;
export const CITY_GAP_M = 50_000;
export const MAX_STOP_PHOTOS = 10;
export const MAX_PICK = 100;
export const MAX_SPAN_DAYS = 60;

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function unique(photos: PickedPhoto[]): PickedPhoto[] {
  const seen = new Set<string>();
  return photos.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

export function spanDays(photos: PickedPhoto[]): number {
  const days = photos.map((p) => p.meta.day).filter((d): d is string => !!d).sort();
  return days.length ? daysBetween(days[0], days[days.length - 1]) + 1 : 0;
}

/** Up to `max` photos of a stop, spread evenly across the visit (first and last kept). */
export function shownPhotos(ids: string[], photos: Record<string, PickedPhoto>, max = MAX_STOP_PHOTOS): string[] {
  if (ids.length <= max) return [...ids];
  const sorted = [...ids].sort((a, b) => (photos[a]?.meta.minutes ?? 0) - (photos[b]?.meta.minutes ?? 0));
  return Array.from({ length: max }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (max - 1))]);
}

export function coverPhoto(days: DraftDay[]): string | null {
  let best: DraftStop | null = null;
  for (const d of days) for (const s of d.stops) if (!best || s.photoIds.length > best.photoIds.length) best = s;
  return best?.shownIds[0] ?? best?.photoIds[0] ?? null;
}

/** Nights per city from each day's city: the last city's last day is the departure day (utils/tripRoute cityRanges). */
export function pastTripNights(dayCities: number[], cityCount: number): number[] {
  return Array.from({ length: cityCount }, (_, i) => {
    const c = dayCities.filter((x) => x === i).length;
    return i === cityCount - 1 ? Math.max(0, c - 1) : c;
  });
}

export function buildPastTrip(input: PickedPhoto[]): PastTripDraft {
  const photos = unique(input);
  const byId: Record<string, PickedPhoto> = Object.fromEntries(photos.map((p) => [p.id, p]));
  const placed = photos
    .filter((p) => p.meta.day && p.meta.minutes !== null && p.meta.lat !== null && p.meta.lng !== null)
    .sort((a, b) => a.meta.day!.localeCompare(b.meta.day!) || a.meta.minutes! - b.meta.minutes!);
  const unplaced = photos.filter((p) => !placed.includes(p)).map((p) => p.id);
  const dated = photos.map((p) => p.meta.day).filter((d): d is string => !!d).sort();
  if (!dated.length) return { title: '', description: '', days: [], cities: [], unplaced, coverId: null, photos: byId };

  const cities: DraftCity[] = [];
  const stopsByDay = new Map<string, DraftStop[]>();
  let current: { stop: DraftStop; day: string; lastMin: number; n: number } | null = null;
  let stopCount = 0;
  for (const ph of placed) {
    const at = { lat: ph.meta.lat!, lng: ph.meta.lng! };
    const sameStop = current && current.day === ph.meta.day
      && ph.meta.minutes! - current.lastMin <= STOP_GAP_MIN
      && haversineMeters({ lat: current.stop.lat, lng: current.stop.lng }, at) <= STOP_GAP_M;
    if (current && sameStop) {
      const k = current.n + 1;
      current.stop.lat += (at.lat - current.stop.lat) / k;
      current.stop.lng += (at.lng - current.stop.lng) / k;
      current.stop.photoIds.push(ph.id);
      current.lastMin = ph.meta.minutes!;
      current.n = k;
      continue;
    }
    const stop: DraftStop = { id: `s${++stopCount}`, lat: at.lat, lng: at.lng, time: hhmm(ph.meta.minutes!), photoIds: [ph.id], shownIds: [], name: '', placeName: null, type: 'activity' };
    current = { stop, day: ph.meta.day!, lastMin: ph.meta.minutes!, n: 1 };
    const list = stopsByDay.get(ph.meta.day!) ?? [];
    list.push(stop);
    stopsByDay.set(ph.meta.day!, list);
  }

  const first = dated[0];
  const count = daysBetween(first, dated[dated.length - 1]) + 1;
  const days: DraftDay[] = [];
  let city = 0;
  for (let i = 0; i < count; i++) {
    const day = addDays(first, i);
    const stops = stopsByDay.get(day) ?? [];
    stops.forEach((s) => { s.shownIds = shownPhotos(s.photoIds, byId); });
    const lead = stops[0];
    if (lead) {
      const here = cities[cities.length - 1];
      if (!here || haversineMeters(here, lead) > CITY_GAP_M) cities.push({ lat: lead.lat, lng: lead.lng, name: '', countryCode: null });
      city = cities.length - 1;
    }
    days.push({ day, city, caption: '', stops });
  }
  return { title: '', description: '', days, cities, unplaced, coverId: coverPhoto(days), photos: byId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/pastTrip.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/pastTrip.ts __tests__/utils/pastTrip.test.ts
git commit -m "feat(past-trips): build days, stops and cities from photos"
```

---

### Task 3: Review edits

**Files:**
- Create: `utils/pastTripEdits.ts`
- Test: `__tests__/utils/pastTripEdits.test.ts`

**Interfaces:**
- Consumes: `PastTripDraft`, `DraftStop`, `shownPhotos`, `coverPhoto` (Task 2).
- Produces:
  ```ts
  export type PastTripEdit =
    | { type: 'title'; value: string }
    | { type: 'caption'; day: number; value: string }
    | { type: 'rename'; stopId: string; name: string }
    | { type: 'place'; stopId: string; name: string; placeName: string; lat: number; lng: number }
    | { type: 'mergeWithPrevious'; stopId: string }
    | { type: 'deleteStop'; stopId: string }
    | { type: 'movePhoto'; photoId: string; toStopId: string }
    | { type: 'toggleShown'; stopId: string; photoId: string }
    | { type: 'cover'; photoId: string };
  export function editPastTrip(d: PastTripDraft, e: PastTripEdit): PastTripDraft
  export function stopById(d: PastTripDraft, id: string): DraftStop | null
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { buildPastTrip, type PickedPhoto } from '@/utils/pastTrip';
import { editPastTrip, stopById } from '@/utils/pastTripEdits';

const p = (id: string, hhmm: string, lat: number | null, lng: number | null): PickedPhoto => ({
  id, uri: `file://${id}`, meta: { day: '2025-05-03', minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), lat, lng },
});
const draft = () => buildPastTrip([p('a', '10:00', 38.7115, -9.13), p('b', '12:00', 38.71, -9.145), p('c', '14:00', 38.69, -9.2), p('x', '15:00', null, null)]);

describe('editPastTrip', () => {
  it('renames a stop and sets its place', () => {
    let d = editPastTrip(draft(), { type: 'rename', stopId: 's1', name: 'Miradouro' });
    expect(stopById(d, 's1')!.name).toBe('Miradouro');
    d = editPastTrip(d, { type: 'place', stopId: 's1', name: 'Castelo', placeName: 'Castelo de São Jorge', lat: 38.7139, lng: -9.1335 });
    expect(stopById(d, 's1')).toMatchObject({ name: 'Castelo', placeName: 'Castelo de São Jorge', lat: 38.7139 });
  });
  it('merges a stop into the one before it (photos joined, earlier time kept)', () => {
    const d = editPastTrip(draft(), { type: 'mergeWithPrevious', stopId: 's2' });
    expect(d.days[0].stops.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(stopById(d, 's1')!.photoIds).toEqual(['a', 'b']);
    expect(stopById(d, 's1')!.time).toBe('10:00');
  });
  it('merging the first stop of a day does nothing', () => {
    const d0 = draft();
    expect(editPastTrip(d0, { type: 'mergeWithPrevious', stopId: 's1' })).toBe(d0);
  });
  it('deleting a stop sends its photos to unplaced', () => {
    const d = editPastTrip(draft(), { type: 'deleteStop', stopId: 's3' });
    expect(d.days[0].stops.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(d.unplaced).toEqual(['x', 'c']);
  });
  it('moves an unplaced photo onto a stop, and a photo between stops', () => {
    let d = editPastTrip(draft(), { type: 'movePhoto', photoId: 'x', toStopId: 's1' });
    expect(d.unplaced).toEqual([]);
    expect(stopById(d, 's1')!.photoIds).toEqual(['a', 'x']);
    d = editPastTrip(d, { type: 'movePhoto', photoId: 'a', toStopId: 's2' });
    expect(stopById(d, 's1')!.photoIds).toEqual(['x']);
    expect(stopById(d, 's2')!.photoIds).toEqual(['b', 'a']);
  });
  it('a stop left with no photos keeps existing (it is still a place you went)', () => {
    const d = editPastTrip(draft(), { type: 'movePhoto', photoId: 'a', toStopId: 's2' });
    expect(stopById(d, 's1')!.photoIds).toEqual([]);
  });
  it('toggleShown swaps which photos (≤ 10) a stop keeps', () => {
    let d = draft();
    d = editPastTrip(d, { type: 'toggleShown', stopId: 's1', photoId: 'a' });
    expect(stopById(d, 's1')!.shownIds).toEqual([]);
    d = editPastTrip(d, { type: 'toggleShown', stopId: 's1', photoId: 'a' });
    expect(stopById(d, 's1')!.shownIds).toEqual(['a']);
  });
  it('the cover stays valid: deleting the cover\'s stop picks a new one', () => {
    let d = editPastTrip(draft(), { type: 'cover', photoId: 'c' });
    expect(d.coverId).toBe('c');
    d = editPastTrip(d, { type: 'deleteStop', stopId: 's3' });
    expect(d.coverId).toBe('a');
  });
  it('title and captions', () => {
    let d = editPastTrip(draft(), { type: 'title', value: 'Five days of Lisbon' });
    d = editPastTrip(d, { type: 'caption', day: 0, value: 'Hills and tiles' });
    expect([d.title, d.days[0].caption]).toEqual(['Five days of Lisbon', 'Hills and tiles']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/pastTripEdits.test.ts`
Expected: FAIL — "Cannot find module '@/utils/pastTripEdits'"

- [ ] **Step 3: Write minimal implementation**

```ts
/** The past-trip review screen's edits, as a pure reducer (spec: rename, change place, merge, delete, move photos). */
import { coverPhoto, MAX_STOP_PHOTOS, shownPhotos, type DraftStop, type PastTripDraft } from '@/utils/pastTrip';

export type PastTripEdit =
  | { type: 'title'; value: string }
  | { type: 'caption'; day: number; value: string }
  | { type: 'rename'; stopId: string; name: string }
  | { type: 'place'; stopId: string; name: string; placeName: string; lat: number; lng: number }
  | { type: 'mergeWithPrevious'; stopId: string }
  | { type: 'deleteStop'; stopId: string }
  | { type: 'movePhoto'; photoId: string; toStopId: string }
  | { type: 'toggleShown'; stopId: string; photoId: string }
  | { type: 'cover'; photoId: string };

export function stopById(d: PastTripDraft, id: string): DraftStop | null {
  for (const day of d.days) for (const s of day.stops) if (s.id === id) return s;
  return null;
}

const mapStops = (d: PastTripDraft, f: (s: DraftStop) => DraftStop): PastTripDraft =>
  ({ ...d, days: d.days.map((day) => ({ ...day, stops: day.stops.map(f) })) });

function withCover(d: PastTripDraft): PastTripDraft {
  const used = new Set(d.days.flatMap((day) => day.stops.flatMap((s) => s.photoIds)));
  return d.coverId && used.has(d.coverId) ? d : { ...d, coverId: coverPhoto(d.days) };
}

export function editPastTrip(d: PastTripDraft, e: PastTripEdit): PastTripDraft {
  switch (e.type) {
    case 'title': return { ...d, title: e.value };
    case 'caption': return { ...d, days: d.days.map((day, i) => (i === e.day ? { ...day, caption: e.value } : day)) };
    case 'rename': return mapStops(d, (s) => (s.id === e.stopId ? { ...s, name: e.name } : s));
    case 'place': return mapStops(d, (s) => (s.id === e.stopId ? { ...s, name: e.name, placeName: e.placeName, lat: e.lat, lng: e.lng } : s));
    case 'cover': return { ...d, coverId: e.photoId };
    case 'mergeWithPrevious': {
      let changed = false;
      const days = d.days.map((day) => {
        const i = day.stops.findIndex((s) => s.id === e.stopId);
        if (i <= 0) return day;
        changed = true;
        const prev = day.stops[i - 1];
        const photoIds = [...prev.photoIds, ...day.stops[i].photoIds];
        const merged = { ...prev, photoIds, shownIds: shownPhotos(photoIds, d.photos) };
        return { ...day, stops: [...day.stops.slice(0, i - 1), merged, ...day.stops.slice(i + 1)] };
      });
      return changed ? { ...d, days } : d;
    }
    case 'deleteStop': {
      const gone = stopById(d, e.stopId);
      if (!gone) return d;
      const days = d.days.map((day) => ({ ...day, stops: day.stops.filter((s) => s.id !== e.stopId) }));
      return withCover({ ...d, days, unplaced: [...d.unplaced, ...gone.photoIds] });
    }
    case 'movePhoto': {
      if (!stopById(d, e.toStopId)) return d;
      const strip = (s: DraftStop): DraftStop => ({ ...s, photoIds: s.photoIds.filter((x) => x !== e.photoId), shownIds: s.shownIds.filter((x) => x !== e.photoId) });
      const moved = mapStops({ ...d, unplaced: d.unplaced.filter((x) => x !== e.photoId) }, (s) => {
        const s2 = strip(s);
        if (s.id !== e.toStopId) return s2;
        const photoIds = [...s2.photoIds, e.photoId];
        const shownIds = s2.shownIds.length < MAX_STOP_PHOTOS ? [...s2.shownIds, e.photoId] : s2.shownIds;
        return { ...s2, photoIds, shownIds };
      });
      return withCover(moved);
    }
    case 'toggleShown':
      return mapStops(d, (s) => {
        if (s.id !== e.stopId || !s.photoIds.includes(e.photoId)) return s;
        if (s.shownIds.includes(e.photoId)) return { ...s, shownIds: s.shownIds.filter((x) => x !== e.photoId) };
        if (s.shownIds.length >= MAX_STOP_PHOTOS) return s;
        return { ...s, shownIds: s.photoIds.filter((x) => x === e.photoId || s.shownIds.includes(x)) };
      });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/pastTripEdits.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/pastTripEdits.ts __tests__/utils/pastTripEdits.test.ts
git commit -m "feat(past-trips): review edits as a pure reducer"
```

---

### Task 4: Nova writes the story (`pastTripStory` callable)

**Files:**
- Modify: `functions/src/agentModel.ts` (add `generateJson`; `generate` unchanged in behaviour)
- Create: `functions/src/pastTripStory.ts` (pure: validate, prompt, schema, parse, fallback)
- Create: `functions/src/pastTripStoryFunctions.ts` (callable)
- Modify: `functions/src/index.ts` (export)
- Test: `functions/src/__tests__/pastTripStory.test.ts` (match the folder the other functions tests live in — `ls functions/src/__tests__ functions/test 2>/dev/null` and use whichever holds `agentModel` tests)

**Interfaces:**
- Produces (server):
  ```ts
  export interface StoryRequest { requestId: string; cities: string[]; days: { day: string; city: number; stops: { name: string; time: string }[] }[] }
  export interface Story { title: string; description: string; dayCaptions: string[] }
  export function validateStoryRequest(v: unknown): StoryRequest | null
  export function storyPrompt(r: StoryRequest): string
  export const STORY_SCHEMA: object
  export function parseStory(text: unknown, dayCount: number): Story | null
  export function fallbackStory(r: StoryRequest): Story
  export async function generateJson<T>(a: GenerateArgs & { parse: (text: unknown) => T | null }): Promise<{ json: T; inputTokens: number; outputTokens: number; latencyMs: number }>
  ```
- Callable `pastTripStory(StoryRequest) → Story & { fromNova: boolean }`. Throws `failed-precondition` without consent, `resource-exhausted` (`details.reason: 'monthly' | 'hourly'`) over the Nova allowance.

- [ ] **Step 1: Write the failing test**

```ts
import { fallbackStory, parseStory, storyPrompt, validateStoryRequest } from '../pastTripStory';

const req = { requestId: 'abcdefghij1234567890', cities: ['Lisbon'], days: [
  { day: '2025-05-03', city: 0, stops: [{ name: 'Alfama', time: '10:00' }, { name: 'Time Out Market', time: '13:10' }] },
  { day: '2025-05-04', city: 0, stops: [] },
] };

describe('pastTripStory', () => {
  it('accepts a well-formed request', () => {
    expect(validateStoryRequest(req)).toEqual(req);
  });
  it('refuses coordinates, oversize trips and bad shapes', () => {
    expect(validateStoryRequest({ ...req, days: [{ ...req.days[0], stops: [{ name: 'X', time: '10:00', lat: 1 }] }] })).toBeNull();
    expect(validateStoryRequest({ ...req, days: Array(61).fill(req.days[1]) })).toBeNull();
    expect(validateStoryRequest({ ...req, cities: [] })).toBeNull();
    expect(validateStoryRequest({ ...req, requestId: 'x' })).toBeNull();
    expect(validateStoryRequest({ ...req, days: [{ day: 'May 3', city: 0, stops: [] }] })).toBeNull();
  });
  it('the prompt carries names and times only', () => {
    const s = storyPrompt(req);
    expect(s).toContain('Time Out Market');
    expect(s).toContain('13:10');
    expect(s).not.toMatch(/-?\d+\.\d{3,}/);
  });
  it('parses an answer, trims to limits, pads or cuts captions to the day count', () => {
    const s = parseStory(JSON.stringify({ title: 'T'.repeat(80), description: 'Hills and tiles. Good food.', dayCaptions: ['Old town'] }), 2)!;
    expect(s.title).toHaveLength(60);
    expect(s.dayCaptions).toEqual(['Old town', '']);
  });
  it('an unreadable answer is null', () => {
    expect(parseStory('nope', 2)).toBeNull();
    expect(parseStory(JSON.stringify({ description: 'x' }), 2)).toBeNull();
  });
  it('fallback: "Trip to {city}", empty captions', () => {
    expect(fallbackStory(req)).toEqual({ title: 'Trip to Lisbon', description: '', dayCaptions: ['', ''] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest src/__tests__/pastTripStory.test.ts` (or the folder found above)
Expected: FAIL — "Cannot find module '../pastTripStory'"

- [ ] **Step 3: Write the pure module**

`functions/src/pastTripStory.ts`:

```ts
/**
 * Nova's words for a past trip built from photos (spec 2026-10-25-past-trips-from-photos): title, a caption a day,
 * a two-sentence description. It sees city and stop names and times only — never photos or coordinates.
 */
import { isValidRequestId } from './generationRequest';

export interface StoryRequest { requestId: string; cities: string[]; days: { day: string; city: number; stops: { name: string; time: string }[] }[] }
export interface Story { title: string; description: string; dayCaptions: string[] }

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export function validateStoryRequest(v: unknown): StoryRequest | null {
  const r = v as StoryRequest;
  if (!r || typeof r !== 'object' || !isValidRequestId(r.requestId)) return null;
  if (!Array.isArray(r.cities) || r.cities.length < 1 || r.cities.length > 20 || !r.cities.every((c) => str(c, 80))) return null;
  if (!Array.isArray(r.days) || r.days.length < 1 || r.days.length > 60) return null;
  let stops = 0;
  for (const d of r.days) {
    if (!d || Object.keys(d).some((k) => !['day', 'city', 'stops'].includes(k))) return null;
    if (typeof d.day !== 'string' || !DAY.test(d.day) || !Number.isInteger(d.city) || d.city < 0 || d.city >= r.cities.length) return null;
    if (!Array.isArray(d.stops)) return null;
    for (const s of d.stops) {
      if (!s || Object.keys(s).some((k) => k !== 'name' && k !== 'time')) return null;
      if (!str(s.name, 80) || typeof s.time !== 'string' || !TIME.test(s.time)) return null;
    }
    stops += d.stops.length;
  }
  return stops <= 200 ? { requestId: r.requestId, cities: r.cities, days: r.days } : null;
}

export const STORY_SYSTEM = 'You write short, warm titles and captions for a trip someone has already taken, like a friend '
  + 'labelling a photo album. Sentence case, no emoji, no exclamation marks, no hashtags. Use only the places given; never invent '
  + 'events. Title ≤ 60 characters (e.g. "Five days of Lisbon"). One caption per day, ≤ 80 characters, empty for a day with no stops. '
  + 'Description: two sentences.';

export function storyPrompt(r: StoryRequest): string {
  const lines = r.days.map((d, i) => `Day ${i + 1} (${d.day}, ${r.cities[d.city]}): ${d.stops.map((s) => `${s.time} ${s.name}`).join('; ') || 'no stops'}`);
  return `Cities: ${r.cities.join(', ')}\n${lines.join('\n')}`;
}

export const STORY_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, description: { type: 'string' }, dayCaptions: { type: 'array', items: { type: 'string' } } },
  required: ['title', 'description', 'dayCaptions'],
};

const clip = (s: string, max: number) => s.trim().slice(0, max);

export function parseStory(text: unknown, dayCount: number): Story | null {
  if (typeof text !== 'string') return null;
  try {
    const v = JSON.parse(text) as Partial<Story>;
    if (typeof v.title !== 'string' || !v.title.trim() || typeof v.description !== 'string' || !Array.isArray(v.dayCaptions)) return null;
    const caps = Array.from({ length: dayCount }, (_, i) => (typeof v.dayCaptions![i] === 'string' ? clip(v.dayCaptions![i] as string, 80) : ''));
    return { title: clip(v.title, 60), description: clip(v.description, 300), dayCaptions: caps };
  } catch {
    return null;
  }
}

export function fallbackStory(r: StoryRequest): Story {
  return { title: `Trip to ${r.cities[0]}`, description: '', dayCaptions: r.days.map(() => '') };
}
```

- [ ] **Step 4: Run the pure tests**

Run: `cd functions && npx jest src/__tests__/pastTripStory.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Add `generateJson` to `functions/src/agentModel.ts`**

Replace the body of `generateOnce(a)` so it takes the parser, and export the generic call. `generate` keeps parsing with `parseModelText`:

```ts
export async function generate(a: GenerateArgs): Promise<ModelResult> {
  return generateJson({ ...a, parse: parseModelText });
}

/** Like `generate`, with the caller's own parser (pastTripStory has no `reply`). Retried once when unreadable. */
export async function generateJson<T>(a: GenerateArgs & { parse: (text: unknown) => T | null }): Promise<{ json: T; inputTokens: number; outputTokens: number; latencyMs: number }> {
  try {
    return await generateOnce(a);
  } catch (e) {
    if (!String(e).includes('unreadable')) throw e;
    return generateOnce(a);
  }
}

async function generateOnce<T>(a: GenerateArgs & { parse: (text: unknown) => T | null }): Promise<{ json: T; inputTokens: number; outputTokens: number; latencyMs: number }> {
  // …unchanged fetch/timeout code…
  const json = a.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(''));
  if (!json) throw new Error('gemini: unreadable response');
  // …unchanged return…
}
```

Keep the existing `fetch`, `AbortController`, headers and usage fields exactly; only the parse line and signatures change. `ModelResult` stays the return type of `generate`.

Run: `cd functions && npm run build && npx jest` 
Expected: build OK, all existing functions tests PASS (agent tests unchanged).

- [ ] **Step 6: Write the callable**

`functions/src/pastTripStoryFunctions.ts`:

```ts
/** `pastTripStory` — one Nova message for a past trip's words (spec 2026-10-25-past-trips-from-photos). */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { AI_CONSENT_REQUIRED_MESSAGE, hasAiConsent } from './aiConsent';
import { agentGate, agentHourKey, agentQuotaPolicy } from './quotaUtils';
import { generateJson } from './agentModel';
import { STORY_SCHEMA, STORY_SYSTEM, fallbackStory, parseStory, storyPrompt, validateStoryRequest, type Story } from './pastTripStory';

const db = () => admin.firestore();

export const pastTripStory = onCall({ region: 'us-central1', timeoutSeconds: 45 }, async (req): Promise<Story & { fromNova: boolean }> => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const r = validateStoryRequest(req.data);
  if (!r) throw new HttpsError('invalid-argument', 'Bad trip');
  const userSnap = await db().doc(`users/${uid}`).get();
  if (!hasAiConsent(userSnap.data(), 'agent')) throw new HttpsError('failed-precondition', AI_CONSENT_REQUIRED_MESSAGE);

  const tier = String(userSnap.get('tier') ?? 'free');
  const policy = agentQuotaPolicy(tier);
  const quotaRef = db().doc(`usage_quotas/${uid}`);
  const hourKey = agentHourKey();
  const doneRef = db().doc(`usage_quotas/${uid}/pastTripStories/${r.requestId}`);
  const done = await doneRef.get();
  if (done.exists) return { ...(done.data() as Story), fromNova: true };

  const q = (await quotaRef.get()).data() ?? {};
  const gate = agentGate({ used: q[policy.quotaKey] ?? 0, limit: policy.limit, hourCount: q[hourKey] ?? 0, inflightUntil: null, now: Date.now() });
  if (gate === 'monthly') throw new HttpsError('resource-exhausted', policy.fairUse ? 'That\'s a lot of Nova this month. It resets on the 1st.' : 'Free accounts get 10 Nova messages a month. Pro gives you plenty more.', { reason: 'monthly', fairUse: policy.fairUse });
  if (gate === 'hourly') throw new HttpsError('resource-exhausted', 'Give it a few minutes and try again.', { reason: 'hourly' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ...fallbackStory(r), fromNova: false };
  try {
    const result = await generateJson({
      system: STORY_SYSTEM, turns: [{ role: 'user', text: storyPrompt(r) }], schema: STORY_SCHEMA, apiKey,
      parse: (t) => parseStory(t, r.days.length),
    });
    const batch = db().batch();
    batch.set(quotaRef, { [policy.quotaKey]: admin.firestore.FieldValue.increment(1), [hourKey]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    batch.set(doneRef, { ...result.json, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    console.log('pastTripStory', { uid, days: r.days.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs });
    return { ...result.json, fromNova: true };
  } catch (err) {
    console.error('pastTripStory failed', { uid, err: String(err) });
    return { ...fallbackStory(r), fromNova: false };
  }
});
```

Add to `functions/src/index.ts` beside the agent export:

```ts
export { pastTripStory } from './pastTripStoryFunctions';
```

`usage_quotas` has no client rule (server only), so the `pastTripStories` subcollection needs none. Add it to `deleteAccount`: in `functions/src/deleteAccount.ts`, where `usage_quotas/{uid}` is deleted, use `db.recursiveDelete(db.doc(\`usage_quotas/${uid}\`))` if it currently uses `.delete()` (read the file; if it's already recursive, no change).

- [ ] **Step 7: Build and test**

Run: `cd functions && npm run build && npx jest`
Expected: build OK, all tests PASS

- [ ] **Step 8: Commit**

```bash
git add functions/src/agentModel.ts functions/src/pastTripStory.ts functions/src/pastTripStoryFunctions.ts functions/src/index.ts functions/src/deleteAccount.ts functions/src/__tests__/pastTripStory.test.ts
git commit -m "feat(past-trips): pastTripStory callable — Nova's title and captions from names and times"
```

---

### Task 5: Trending ignores trips that had already ended

**Files:**
- Modify: `functions/src/trending.ts` (add `endedBeforeCreated`)
- Modify: `functions/src/trendingFunctions.ts` (`onTripWrittenTrend`, after the editorial check)
- Test: the existing trending test file (`grep -rl "trendWeight" functions/src --include=*.test.ts`)

**Interfaces:**
- Produces: `export function endedBeforeCreated(trip: { endDate?: unknown; createdAt?: unknown }): boolean`

- [ ] **Step 1: Write the failing test** (append to the trending test file)

```ts
import { endedBeforeCreated } from '../trending';

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });
describe('endedBeforeCreated', () => {
  it('a trip added after it ended is not trending', () => {
    expect(endedBeforeCreated({ endDate: ts('2025-05-07T00:00:00Z'), createdAt: ts('2026-10-25T00:00:00Z') })).toBe(true);
  });
  it('a trip still to come, under way, or ending today counts', () => {
    expect(endedBeforeCreated({ endDate: ts('2026-11-01T00:00:00Z'), createdAt: ts('2026-10-25T00:00:00Z') })).toBe(false);
    expect(endedBeforeCreated({ endDate: ts('2026-10-25T00:00:00Z'), createdAt: ts('2026-10-25T20:00:00Z') })).toBe(false);
  });
  it('no dates (or no createdAt yet) counts', () => {
    expect(endedBeforeCreated({ endDate: null, createdAt: ts('2026-10-25T00:00:00Z') })).toBe(false);
    expect(endedBeforeCreated({ endDate: ts('2025-05-07T00:00:00Z') })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest -t endedBeforeCreated`
Expected: FAIL — "endedBeforeCreated is not a function"

- [ ] **Step 3: Implement**

In `functions/src/trending.ts`:

```ts
const millis = (v: unknown): number | null =>
  v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : null;

/**
 * A trip that had ended over a day before it was created — a past trip someone added (from photos or by hand).
 * Trending shows where people are heading; last year's Lisbon trip shouldn't make Lisbon trend.
 */
export function endedBeforeCreated(trip: { endDate?: unknown; createdAt?: unknown }): boolean {
  const end = millis(trip.endDate);
  const created = millis(trip.createdAt);
  return end !== null && created !== null && end + 86_400_000 < created;
}
```

In `functions/src/trendingFunctions.ts`, directly after `if (isEditorialTrip(after, editorialUid())) return;`:

```ts
  if (endedBeforeCreated(after)) return; // a past trip someone added isn't where anyone is heading
```

and add `endedBeforeCreated` to the import from `./trending`.

- [ ] **Step 4: Build and test**

Run: `cd functions && npm run build && npx jest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/src/trending.ts functions/src/trendingFunctions.ts functions/src/**/*.test.ts
git commit -m "feat(past-trips): trending ignores trips added after they ended"
```

---

### Task 6: Nova's trip check skips past trips; journal holds 10 photos

**Files:**
- Modify: `utils/tripCheck.ts` (add `shouldRunTripCheck`)
- Modify: `components/agent/AgentSheet.tsx:94`
- Modify: `hooks/useJournal.ts:11` (`MAX_JOURNAL_PHOTOS = 10`, comment)
- Test: `__tests__/utils/tripCheck.test.ts` (existing — append)

**Interfaces:**
- Consumes: `displayStatus` from `@/utils/tripStatus`.
- Produces: `export function shouldRunTripCheck(trip: { status: TripStatus; startDate: Date | null; endDate: Date | null }, now: Date): boolean`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { shouldRunTripCheck } from '@/utils/tripCheck';
import { MAX_JOURNAL_PHOTOS } from '@/hooks/useJournal';

describe('shouldRunTripCheck', () => {
  const now = new Date(2026, 9, 25, 12);
  it('runs on upcoming, current and undated trips', () => {
    expect(shouldRunTripCheck({ status: 'planning', startDate: new Date(2026, 10, 1), endDate: new Date(2026, 10, 5) }, now)).toBe(true);
    expect(shouldRunTripCheck({ status: 'planning', startDate: new Date(2026, 9, 24), endDate: new Date(2026, 9, 27) }, now)).toBe(true);
    expect(shouldRunTripCheck({ status: 'planning', startDate: null, endDate: null }, now)).toBe(true);
  });
  it('skips a trip that has ended (nothing to fix in the past)', () => {
    expect(shouldRunTripCheck({ status: 'planning', startDate: new Date(2025, 4, 3), endDate: new Date(2025, 4, 7) }, now)).toBe(false);
  });
});

describe('journal photo cap', () => {
  it('a stop holds 10 photos (past trips from photos)', () => {
    expect(MAX_JOURNAL_PHOTOS).toBe(10);
  });
});
```

If importing `@/hooks/useJournal` pulls in Firebase, add at the top of the test file the same mocks other suites use (`jest.mock('@/services/firebase', () => ({ db: {}, storage: {}, auth: {} }))` and the AsyncStorage mock `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))`), or move the cap test into its own `__tests__/hooks/journalCap.test.ts` with those mocks.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/tripCheck.test.ts`
Expected: FAIL — "shouldRunTripCheck is not a function"; cap test expects 10 got 5

- [ ] **Step 3: Implement**

`utils/tripCheck.ts` (add, plus `import { displayStatus } from '@/utils/tripStatus'; import type { TripStatus } from '@/types';`):

```ts
/** The free trip check fixes plans; a trip that has ended has nothing to fix (spec 2026-10-25-past-trips-from-photos). */
export function shouldRunTripCheck(trip: { status: TripStatus; startDate: Date | null; endDate: Date | null }, now: Date): boolean {
  return displayStatus(trip, now) !== 'completed';
}
```

`components/agent/AgentSheet.tsx` line 94 becomes:

```ts
  const findings = useMemo(() => (
    visible && shouldRunTripCheck({ status: trip.status, startDate: toDateOrNull(trip.startDate), endDate: toDateOrNull(trip.endDate) }, new Date())
      ? tripCheck(trip, checkBookings(bookings), tripStart(trip))
      : []
  ), [visible, trip, bookings]);
```

Import `shouldRunTripCheck` with the other `@/utils/tripCheck` names, and `toDateOrNull` from wherever `app/(tabs)/profile.tsx` imports it (`grep -n "toDateOrNull" "app/(tabs)/profile.tsx"`).

`hooks/useJournal.ts`:

```ts
/** Photos per stop. 10 since past trips from photos (2026-10-25): one museum or dinner easily has a dozen. */
export const MAX_JOURNAL_PHOTOS = 10;
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/utils/tripCheck.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add utils/tripCheck.ts components/agent/AgentSheet.tsx hooks/useJournal.ts __tests__/
git commit -m "feat(past-trips): skip the trip check on past trips; 10 journal photos a stop"
```

---

### Task 7: Name stops and cities

**Files:**
- Create: `utils/pastTripPlaces.ts` (pure: read Mapbox answers)
- Create: `services/pastTripPlaces.ts` (fetch)
- Test: `__tests__/utils/pastTripPlaces.test.ts`

**Interfaces:**
- Consumes: `PastTripDraft`, `DraftStop` (Task 2); `haversineMeters`.
- Produces:
  ```ts
  // utils/pastTripPlaces.ts
  export const NAMED_WITHIN_M = 100;
  export function poiFromSearchBox(json: unknown, at: { lat: number; lng: number }): { name: string; type: DraftStop['type'] } | null
  export function areaFromGeocode(json: unknown): { neighbourhood: string | null; city: string | null; countryCode: string | null }
  export function stopFallbackName(index: number): string   // "Stop 3"
  // services/pastTripPlaces.ts
  export async function nameDraft(d: PastTripDraft, onStop?: (done: number, total: number) => void): Promise<PastTripDraft>
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { areaFromGeocode, poiFromSearchBox, stopFallbackName } from '@/utils/pastTripPlaces';

const at = { lat: 38.7139, lng: -9.1335 };
const feature = (name: string, lat: number, lng: number, cat: string[] = []) => ({
  properties: { name, feature_type: 'poi', poi_category: cat, coordinates: { latitude: lat, longitude: lng } },
});

describe('poiFromSearchBox', () => {
  it('the nearest named place within 100 m, typed by category', () => {
    const json = { features: [feature('Far café', 38.716, -9.1335, ['cafe']), feature('Castelo de São Jorge', 38.7139, -9.1334, ['castle', 'tourist attraction'])] };
    expect(poiFromSearchBox(json, at)).toEqual({ name: 'Castelo de São Jorge', type: 'activity' });
  });
  it('restaurants, cafés and bars are restaurants; hotels are hotels', () => {
    expect(poiFromSearchBox({ features: [feature('Taberna', 38.7139, -9.1335, ['restaurant'])] }, at)!.type).toBe('restaurant');
    expect(poiFromSearchBox({ features: [feature('Bar', 38.7139, -9.1335, ['bar'])] }, at)!.type).toBe('restaurant');
    expect(poiFromSearchBox({ features: [feature('Hotel X', 38.7139, -9.1335, ['hotel'])] }, at)!.type).toBe('hotel');
  });
  it('nothing within 100 m, or a broken answer → null', () => {
    expect(poiFromSearchBox({ features: [feature('Far', 38.72, -9.1335)] }, at)).toBeNull();
    expect(poiFromSearchBox(null, at)).toBeNull();
    expect(poiFromSearchBox({ features: [{}] }, at)).toBeNull();
  });
});

describe('areaFromGeocode', () => {
  it('reads neighbourhood, city and country from a v6 reverse answer', () => {
    const json = { features: [{ properties: { feature_type: 'neighborhood', name: 'Alfama', context: { place: { name: 'Lisbon' }, country: { country_code: 'PT' } } } }] };
    expect(areaFromGeocode(json)).toEqual({ neighbourhood: 'Alfama', city: 'Lisbon', countryCode: 'PT' });
  });
  it('a place-level answer gives the city', () => {
    const json = { features: [{ properties: { feature_type: 'place', name: 'Sintra', context: { country: { country_code: 'pt' } } } }] };
    expect(areaFromGeocode(json)).toEqual({ neighbourhood: null, city: 'Sintra', countryCode: 'PT' });
  });
  it('nothing → all null', () => {
    expect(areaFromGeocode({})).toEqual({ neighbourhood: null, city: null, countryCode: null });
  });
});

it('fallback stop name', () => {
  expect(stopFallbackName(2)).toBe('Stop 3');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/pastTripPlaces.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the pure module**

```ts
/** Reading Mapbox answers for past-trip stops (spec: nearest named place ≤ 100 m, else the neighbourhood). */
import type { DraftStop } from '@/utils/pastTrip';
import { haversineMeters } from '@/utils/tripRoutes';

export const NAMED_WITHIN_M = 100;
const FOOD = ['restaurant', 'cafe', 'coffee', 'bar', 'pub', 'food', 'bakery', 'brewery', 'winery'];
const STAY = ['hotel', 'hostel', 'lodging', 'motel', 'guest house', 'resort'];

type Feat = { properties?: { name?: unknown; poi_category?: unknown; coordinates?: { latitude?: unknown; longitude?: unknown } } };

export function poiFromSearchBox(json: unknown, at: { lat: number; lng: number }): { name: string; type: DraftStop['type'] } | null {
  const feats = (json as { features?: Feat[] } | null)?.features;
  if (!Array.isArray(feats)) return null;
  let best: { name: string; cats: string[]; d: number } | null = null;
  for (const f of feats) {
    const p = f?.properties;
    const lat = Number(p?.coordinates?.latitude);
    const lng = Number(p?.coordinates?.longitude);
    if (typeof p?.name !== 'string' || !p.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineMeters(at, { lat, lng });
    if (d > NAMED_WITHIN_M || (best && best.d <= d)) continue;
    best = { name: p.name.trim(), cats: Array.isArray(p.poi_category) ? p.poi_category.map(String) : [], d };
  }
  if (!best) return null;
  const has = (list: string[]) => best!.cats.some((c) => list.some((w) => c.toLowerCase().includes(w)));
  return { name: best.name, type: has(STAY) ? 'hotel' : has(FOOD) ? 'restaurant' : 'activity' };
}

type GeoFeat = { properties?: { feature_type?: unknown; name?: unknown; context?: { place?: { name?: unknown }; country?: { country_code?: unknown } } } };

export function areaFromGeocode(json: unknown): { neighbourhood: string | null; city: string | null; countryCode: string | null } {
  const f = ((json as { features?: GeoFeat[] } | null)?.features ?? [])[0]?.properties;
  if (!f) return { neighbourhood: null, city: null, countryCode: null };
  const type = String(f.feature_type ?? '');
  const name = typeof f.name === 'string' ? f.name : null;
  const neighbourhood = type === 'neighborhood' || type === 'locality' ? name : null;
  const city = type === 'place' ? name : typeof f.context?.place?.name === 'string' ? f.context.place.name : null;
  const cc = f.context?.country?.country_code;
  return { neighbourhood, city, countryCode: typeof cc === 'string' ? cc.toUpperCase() : null };
}

export function stopFallbackName(index: number): string {
  return `Stop ${index + 1}`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/utils/pastTripPlaces.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Implement the service** (`services/pastTripPlaces.ts`)

```ts
/**
 * Names a past trip's stops and cities: one Search Box reverse (POIs) per stop, one Geocoding v6 reverse per stop
 * for its neighbourhood and per city for its name. A failed lookup names the stop after its area, else "Stop n".
 */
import type { PastTripDraft } from '@/utils/pastTrip';
import { areaFromGeocode, poiFromSearchBox, stopFallbackName } from '@/utils/pastTripPlaces';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
const poiUrl = (lat: number, lng: number) => `https://api.mapbox.com/search/searchbox/v1/reverse?longitude=${lng}&latitude=${lat}&types=poi&limit=5&access_token=${TOKEN}`;
const areaUrl = (lat: number, lng: number, types: string) => `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=${types}&access_token=${TOKEN}`;

export async function nameDraft(d: PastTripDraft, onStop?: (done: number, total: number) => void): Promise<PastTripDraft> {
  const cities = await Promise.all(d.cities.map(async (c) => {
    const area = areaFromGeocode(await getJson(areaUrl(c.lat, c.lng, 'place')));
    return { ...c, name: area.city ?? c.name, countryCode: area.countryCode ?? c.countryCode };
  }));
  const total = d.days.reduce((n, day) => n + day.stops.length, 0);
  let done = 0;
  let index = 0;
  const days = [];
  for (const day of d.days) {
    const stops = [];
    for (const s of day.stops) {
      const i = index++;
      const [poi, area] = await Promise.all([
        getJson(poiUrl(s.lat, s.lng)).then((j) => poiFromSearchBox(j, s)),
        getJson(areaUrl(s.lat, s.lng, 'neighborhood,locality')).then(areaFromGeocode),
      ]);
      const name = poi?.name ?? area.neighbourhood ?? stopFallbackName(i);
      stops.push({ ...s, name, placeName: poi?.name ?? null, type: poi?.type ?? 'activity' });
      onStop?.(++done, total);
    }
    days.push({ ...day, stops });
  }
  return { ...d, cities, days };
}
```

- [ ] **Step 6: Commit**

```bash
git add utils/pastTripPlaces.ts services/pastTripPlaces.ts __tests__/utils/pastTripPlaces.test.ts
git commit -m "feat(past-trips): name stops and cities from Mapbox"
```

---

### Task 8: The trip's documents, and saving with photos

**Files:**
- Create: `utils/pastTripDocs.ts` (pure)
- Create: `services/pastTrip.ts`
- Test: `__tests__/utils/pastTripDocs.test.ts`

**Interfaces:**
- Consumes: `PastTripDraft`, `pastTripNights` (Task 2).
- Produces:
  ```ts
  // utils/pastTripDocs.ts
  export interface PastTripDocs {
    trip: { title: string; description: string; destination: Record<string, unknown>; additionalDestinations: Record<string, unknown>[]; startDay: string; endDay: string; visibility: TripVisibility };
    days: { key: string; dayNumber: number; destinationIndex: number; title: string; notes: string }[];
    stops: { key: string; dayKey: string; order: number; title: string; placeName: string | null; type: string; lat: number; lng: number; startTime: string; photoIds: string[] }[];
  }
  export function pastTripDocs(d: PastTripDraft, visibility: TripVisibility): PastTripDocs
  export function uploadQueue(docs: PastTripDocs, done: Set<string>): { stopKey: string; photoId: string }[]
  // services/pastTrip.ts
  export interface SavedPastTrip { tripId: string; dayIds: Record<string, string>; stopIds: Record<string, string>; failed: { stopKey: string; photoId: string }[]; urls: Record<string, string> }
  export async function savePastTrip(d: PastTripDraft, visibility: TripVisibility, onProgress?: (fraction: number) => void): Promise<{ saved: SavedPastTrip; docs: PastTripDocs }>
  export async function uploadPastTripPhotos(d: PastTripDraft, saved: SavedPastTrip, docs: PastTripDocs, onProgress?: (fraction: number) => void): Promise<SavedPastTrip>
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { buildPastTrip, type PickedPhoto } from '@/utils/pastTrip';
import { pastTripDocs, uploadQueue } from '@/utils/pastTripDocs';

const p = (id: string, day: string, hhmm: string, lat: number, lng: number): PickedPhoto => ({ id, uri: `file://${id}`, meta: { day, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), lat, lng } });
const named = (d: ReturnType<typeof buildPastTrip>) => ({
  ...d, title: 'Lisbon and Porto',
  cities: d.cities.map((c, i) => ({ ...c, name: i ? 'Porto' : 'Lisbon', countryCode: 'PT' })),
  days: d.days.map((day) => ({ ...day, caption: day.stops.length ? 'A good day' : '', stops: day.stops.map((s) => ({ ...s, name: `Place ${s.id}` })) })),
});

describe('pastTripDocs', () => {
  it('one day in one city: no nights, start = end', () => {
    const docs = pastTripDocs(named(buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13)])), 'followers');
    expect(docs.trip.startDay).toBe('2025-05-03');
    expect(docs.trip.endDay).toBe('2025-05-03');
    expect(docs.trip.destination).not.toHaveProperty('nights');
    expect(docs.trip.additionalDestinations).toEqual([]);
    expect(docs.trip.visibility).toBe('followers');
  });
  it('two cities: nights on each, days numbered with their city, stops ordered with their times', () => {
    const d = named(buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13), p('b', '2025-05-03', '12:00', 38.71, -9.145), p('c', '2025-05-05', '10:00', 41.1496, -8.611)]));
    const docs = pastTripDocs(d, 'public');
    expect(docs.trip.destination).toMatchObject({ name: 'Lisbon', countryCode: 'PT', nights: 2, placeId: '' });
    expect(docs.trip.additionalDestinations).toEqual([expect.objectContaining({ name: 'Porto', nights: 0 })]);
    expect(docs.days.map((x) => [x.dayNumber, x.destinationIndex, x.notes])).toEqual([[1, 0, 'A good day'], [2, 0, ''], [3, 1, 'A good day']]);
    expect(docs.stops.map((s) => [s.dayKey, s.order, s.startTime])).toEqual([['d1', 0, '10:00'], ['d1', 1000, '12:00'], ['d3', 0, '10:00']]);
  });
  it('a stop uploads only its shown photos (≤ 10)', () => {
    const d = named(buildPastTrip(Array.from({ length: 12 }, (_, i) => p(`x${i}`, '2025-05-03', `10:${String(i).padStart(2, '0')}`, 38.7115, -9.13))));
    expect(pastTripDocs(d, 'private').stops[0].photoIds).toHaveLength(10);
  });
  it('the upload queue skips what is already done (a retry never uploads twice)', () => {
    const d = named(buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13), p('b', '2025-05-03', '10:05', 38.7115, -9.13)]));
    const docs = pastTripDocs(d, 'private');
    expect(uploadQueue(docs, new Set()).map((q) => q.photoId)).toEqual(['a', 'b']);
    expect(uploadQueue(docs, new Set(['a'])).map((q) => q.photoId)).toEqual(['b']);
  });
  it('a stop never saves with an empty title', () => {
    const d = buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13)]);
    expect(pastTripDocs(d, 'private').stops[0].title).toBe('Stop 1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/pastTripDocs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the pure module**

```ts
/** A reviewed past-trip draft as the Firestore docs to write (spec 2026-10-25-past-trips-from-photos). */
import type { TripVisibility } from '@/types';
import { pastTripNights, type PastTripDraft } from '@/utils/pastTrip';
import { stopFallbackName } from '@/utils/pastTripPlaces';

export interface PastTripDocs {
  trip: { title: string; description: string; destination: Record<string, unknown>; additionalDestinations: Record<string, unknown>[]; startDay: string; endDay: string; visibility: TripVisibility };
  days: { key: string; dayNumber: number; destinationIndex: number; title: string; notes: string }[];
  stops: { key: string; dayKey: string; order: number; title: string; placeName: string | null; type: string; lat: number; lng: number; startTime: string; photoIds: string[] }[];
}

export function pastTripDocs(d: PastTripDraft, visibility: TripVisibility): PastTripDocs {
  const multi = d.cities.length > 1;
  const nights = multi ? pastTripNights(d.days.map((x) => x.city), d.cities.length) : [];
  const city = (i: number) => {
    const c = d.cities[i];
    const base = { name: c?.name || 'Somewhere', countryCode: c?.countryCode ?? null, lat: c?.lat ?? null, lng: c?.lng ?? null, placeId: '' };
    return multi ? { ...base, nights: nights[i] } : base;
  };
  let n = 0;
  const stops: PastTripDocs['stops'] = [];
  const days = d.days.map((day, i) => {
    const key = `d${i + 1}`;
    day.stops.forEach((s, j) => stops.push({
      key: s.id, dayKey: key, order: j * 1000, title: s.name.trim() || stopFallbackName(n), placeName: s.placeName,
      type: s.type, lat: s.lat, lng: s.lng, startTime: s.time, photoIds: s.shownIds,
    }) && n++);
    return { key, dayNumber: i + 1, destinationIndex: day.city, title: '', notes: day.caption.trim() };
  });
  return {
    trip: {
      title: d.title.trim() || `Trip to ${d.cities[0]?.name || 'somewhere'}`,
      description: d.description.trim(),
      destination: city(0),
      additionalDestinations: d.cities.slice(1).map((_, i) => city(i + 1)),
      startDay: d.days[0]?.day ?? '',
      endDay: d.days[d.days.length - 1]?.day ?? '',
      visibility,
    },
    days,
    stops,
  };
}

export function uploadQueue(docs: PastTripDocs, done: Set<string>): { stopKey: string; photoId: string }[] {
  return docs.stops.flatMap((s) => s.photoIds.filter((id) => !done.has(id)).map((photoId) => ({ stopKey: s.key, photoId })));
}
```

(Note: `stops.push(...) && n++` — `push` returns the new length, always truthy; write it as two statements if the linter objects.)

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/utils/pastTripDocs.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Implement the save service** (`services/pastTrip.ts`)

```ts
/**
 * Saves a reviewed past trip: the trip doc, then every day and stop in one batch (rules read the parent trip with
 * get(), which can't see a trip created in the same batch — so the trip is deleted if the batch fails), then the
 * photos, re-encoded with no metadata or location, to each stop's journal (≤ 10 a stop), then the cover.
 */
import { collection, deleteDoc, doc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { auth, db, storage } from '@/services/firebase';
import type { TripVisibility } from '@/types';
import type { PastTripDraft } from '@/utils/pastTrip';
import { pastTripDocs, uploadQueue, type PastTripDocs } from '@/utils/pastTripDocs';
import { PHOTO_QUALITY, uploadResize } from '@/utils/photoUpload';

export interface SavedPastTrip { tripId: string; dayIds: Record<string, string>; stopIds: Record<string, string>; failed: { stopKey: string; photoId: string }[]; urls: Record<string, string> }

const localDate = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };

async function cleanJpeg(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = uploadResize(original.width, original.height);
  const image = resize ? await ImageManipulator.manipulate(uri).resize(resize).renderAsync() : original;
  return (await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG })).uri;
}

async function uploadOne(path: string, uri: string): Promise<string> {
  // Never upload the original: it carries the photo's location. A photo that can't be re-encoded fails instead.
  const blob = await fetch(await cleanJpeg(uri)).then((r) => r.blob());
  const r = ref(storage, path);
  await new Promise<void>((resolve, reject) => uploadBytesResumable(r, blob, { contentType: 'image/jpeg' }).on('state_changed', undefined, reject, () => resolve()));
  return getDownloadURL(r);
}

export async function savePastTrip(d: PastTripDraft, visibility: TripVisibility, onProgress?: (f: number) => void): Promise<{ saved: SavedPastTrip; docs: PastTripDocs }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  const docs = pastTripDocs(d, visibility);
  const tripRef = doc(collection(db, 'trips'));
  const start = localDate(docs.trip.startDay);
  await setDoc(tripRef, {
    authorUid: uid, title: docs.trip.title, description: docs.trip.description,
    destination: docs.trip.destination, additionalDestinations: docs.trip.additionalDestinations,
    startDate: Timestamp.fromDate(start), startDay: docs.trip.startDay, endDate: Timestamp.fromDate(localDate(docs.trip.endDay)),
    visibility, tags: [], coverImageUrl: null, isAiGenerated: false, source: 'photos', status: 'planning',
    collaborators: [], likesCount: 0, savesCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const dayIds: Record<string, string> = {};
  const stopIds: Record<string, string> = {};
  const batch = writeBatch(db);
  for (const day of docs.days) {
    const dayRef = doc(collection(db, 'trips', tripRef.id, 'days'));
    dayIds[day.key] = dayRef.id;
    batch.set(dayRef, { dayNumber: day.dayNumber, destinationIndex: day.destinationIndex, date: null, title: day.title, notes: day.notes });
  }
  for (const s of docs.stops) {
    const stopRef = doc(collection(db, 'trips', tripRef.id, 'days', dayIds[s.dayKey], 'activities'));
    stopIds[s.key] = stopRef.id;
    batch.set(stopRef, {
      type: s.type, title: s.title, titleSource: 'user', placeId: null, placeName: s.placeName, address: null,
      lat: s.lat, lng: s.lng, startTime: s.startTime, endTime: null, durationMinutes: null, notes: '',
      bookingRef: null, cost: null, currency: null, mediaUrls: [], order: s.order, createdAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (e) {
    await deleteDoc(tripRef).catch(() => {});
    throw e;
  }
  onProgress?.(0.1);
  const saved = await uploadPastTripPhotos(d, { tripId: tripRef.id, dayIds, stopIds, failed: [], urls: {} }, docs, (f) => onProgress?.(0.1 + f * 0.9));
  return { saved, docs };
}

/** Uploads every photo not yet uploaded (a retry passes the previous result), writes each stop's journal and the cover. */
export async function uploadPastTripPhotos(d: PastTripDraft, saved: SavedPastTrip, docs: PastTripDocs, onProgress?: (f: number) => void): Promise<SavedPastTrip> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  const urls = { ...saved.urls };
  const queue = uploadQueue(docs, new Set(Object.keys(urls)));
  const failed: SavedPastTrip['failed'] = [];
  let done = 0;
  const work = async (item: { stopKey: string; photoId: string }) => {
    const path = `journal_photos/${uid}/${saved.tripId}/${saved.stopIds[item.stopKey]}/${item.photoId.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
    const uri = d.photos[item.photoId]?.uri;
    try {
      urls[item.photoId] = await uploadOne(path, uri);
    } catch {
      try { urls[item.photoId] = await uploadOne(path, uri); } catch { failed.push(item); }
    }
    onProgress?.(++done / Math.max(1, queue.length));
  };
  for (let i = 0; i < queue.length; i += 3) await Promise.all(queue.slice(i, i + 3).map(work));

  const batch = writeBatch(db);
  for (const s of docs.stops) {
    const photoUrls = s.photoIds.map((id) => urls[id]).filter((u): u is string => !!u);
    if (!photoUrls.length) continue;
    batch.set(doc(db, 'trips', saved.tripId, 'days', saved.dayIds[s.dayKey], 'activities', saved.stopIds[s.key], 'journal', 'entry'), { note: '', photoUrls });
  }
  await batch.commit();
  const coverUrl = d.coverId ? urls[d.coverId] : undefined;
  if (coverUrl) await updateDoc(doc(db, 'trips', saved.tripId), { coverImageUrl: coverUrl, updatedAt: serverTimestamp() });
  return { ...saved, urls, failed };
}
```

The Storage path names each file after the photo id, so a retry overwrites the same object instead of adding a second copy (Review Focus 4). Journal writes are a whole-entry `set` of the stop's uploaded photos, so a retry rewrites the full list.

- [ ] **Step 6: Type check and test**

Run: `npx tsc --noEmit -p . && npx jest __tests__/utils/pastTripDocs.test.ts`
Expected: no errors, PASS

- [ ] **Step 7: Commit**

```bash
git add utils/pastTripDocs.ts services/pastTrip.ts __tests__/utils/pastTripDocs.test.ts
git commit -m "feat(past-trips): trip documents and saving with photos on each stop"
```

---

### Task 9: The flow screen (pick → building → review → finish)

**Files:**
- Create: `hooks/usePastTripBuilder.ts`
- Create: `app/trip/past.tsx`
- Create: `components/pastTrip/PastTripReview.tsx`
- Create: `components/pastTrip/PastStopCard.tsx`
- Create: `components/pastTrip/MoveToStopSheet.tsx`
- Create: `components/pastTrip/PastTripFinish.tsx`
- Modify: `app/_layout.tsx:85` (register the route)
- Modify: `app.json` (Android permission)

**Interfaces:**
- Consumes: Tasks 1–8. `useAiConsentGate` (`components/ai/useAiConsentGate.tsx`: `{ requireConsent(purpose, action), consentSheet }`), `requireOnline` (`services/offline.ts`), `functions` (`services/firebase`), `httpsCallable`, `useLimitPaywall` for a `resource-exhausted` `monthly` answer on free (same as `useAgent`), `AiGeneratingAnimation` / the star, `EmptyState`, `Button`, `useTheme`.
- Produces: `usePastTripBuilder() → { phase: 'intro' | 'building' | 'review' | 'saving' | 'done', draft, progress, pick(), edit(e), save(visibility), retryUploads(), result, error, noLocations }`.

- [ ] **Step 1: The hook** (`hooks/usePastTripBuilder.ts`)

```ts
/** The past-trip flow's state (spec 2026-10-25-past-trips-from-photos). The draft lives only in memory until Save. */
import { useCallback, useReducer, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { doc, collection } from 'firebase/firestore';
import { db, functions } from '@/services/firebase';
import { requireOnline } from '@/services/offline';
import { photoMeta } from '@/utils/photoMeta';
import { buildPastTrip, MAX_PICK, MAX_SPAN_DAYS, spanDays, type PastTripDraft, type PickedPhoto } from '@/utils/pastTrip';
import { editPastTrip, type PastTripEdit } from '@/utils/pastTripEdits';
import { nameDraft } from '@/services/pastTripPlaces';
import { savePastTrip, uploadPastTripPhotos, type SavedPastTrip } from '@/services/pastTrip';
import type { PastTripDocs } from '@/utils/pastTripDocs';
import type { TripVisibility } from '@/types';

type Phase = 'intro' | 'building' | 'review' | 'saving' | 'done';
type Story = { title: string; description: string; dayCaptions: string[]; fromNova: boolean };

export function usePastTripBuilder(opts: { withConsent: (action: () => void) => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0); // 0 reading, 1 places, 2 story
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, dispatch] = useReducer((d: PastTripDraft | null, a: { set: PastTripDraft } | PastTripEdit) =>
    ('set' in a ? a.set : d ? editPastTrip(d, a) : d), null);
  const [result, setResult] = useState<{ saved: SavedPastTrip; docs: PastTripDocs } | null>(null);
  const draftRef = useRef<PastTripDraft | null>(null);
  draftRef.current = draft;

  const writeStory = useCallback(async (d: PastTripDraft): Promise<PastTripDraft> => {
    const call = httpsCallable<unknown, Story>(functions, 'pastTripStory');
    const req = {
      requestId: doc(collection(db, 'trips')).id,
      cities: d.cities.map((c) => c.name || 'Somewhere'),
      days: d.days.map((day) => ({ day: day.day, city: day.city, stops: day.stops.map((s) => ({ name: s.name.slice(0, 80), time: s.time })) })),
    };
    try {
      const { data } = await call(req);
      return { ...d, title: data.title, description: data.description, days: d.days.map((day, i) => ({ ...day, caption: data.dayCaptions[i] ?? '' })) };
    } catch {
      return { ...d, title: `Trip to ${d.cities[0]?.name || 'somewhere'}` };
    }
  }, []);

  const pick = useCallback(async () => {
    setError(null);
    if (!requireOnline()) { setError('Connect to the internet to build a trip'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PICK, exif: true, quality: 1 });
    if (res.canceled || !res.assets.length) return;
    const photos: PickedPhoto[] = res.assets.map((a, i) => ({ id: a.assetId ?? `p${i}`, uri: a.uri, meta: photoMeta(a.exif as Record<string, unknown> | null) }));
    if (spanDays(photos) > MAX_SPAN_DAYS) { setError('These photos cover more than 60 days. Pick one trip at a time.'); return; }
    setPhase('building'); setStep(0);
    let d = buildPastTrip(photos);
    if (!d.days.length) { setPhase('intro'); setError("These photos don't say when they were taken. Try photos from your camera."); return; }
    setStep(1);
    d = await nameDraft(d, (done, total) => setProgress(done / Math.max(1, total)));
    setStep(2);
    const named = d;
    await new Promise<void>((resolve) => opts.withConsent(async () => { d = await writeStory(named); resolve(); }));
    if (!d.title) d = { ...d, title: `Trip to ${d.cities[0]?.name || 'somewhere'}` };
    dispatch({ set: d });
    setPhase('review');
  }, [opts, writeStory]);

  const edit = useCallback((e: PastTripEdit) => dispatch(e), []);

  const save = useCallback(async (visibility: TripVisibility) => {
    const d = draftRef.current;
    if (!d) return;
    if (!requireOnline()) { setError('Connect to the internet to build a trip'); return; }
    setPhase('saving'); setProgress(0); setError(null);
    try {
      setResult(await savePastTrip(d, visibility, setProgress));
      setPhase('done');
    } catch {
      setPhase('review');
      setError("Couldn't save the trip. Check your connection and try again.");
    }
  }, []);

  const retryUploads = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !result) return;
    const saved = await uploadPastTripPhotos(d, result.saved, result.docs, setProgress);
    setResult({ ...result, saved });
  }, [result]);

  const noLocations = !!draft && draft.cities.length === 0;
  return { phase, step, progress, error, draft, pick, edit, save, retryUploads, result, noLocations, platform: Platform.OS };
}
```

`opts.withConsent` is the screen's `requireConsent('agent', action)`. When the person closes the consent sheet without allowing, the gate never calls `action` — so the screen must also resolve the wait: pass a `withConsent` that calls `requireConsent('agent', action)` and, if consent is already declined (`useAiConsentGate` exposes no "declined" callback today), resolves via an `onClose` wrapper. Read `components/ai/useAiConsentGate.tsx`; if it has no close hook, add an optional `onDismiss` to `requireConsent(purpose, action, onDismiss?)` that `handleClose` calls, and in the hook pass `() => resolve()` as `onDismiss` so a declined consent continues with "Trip to {city}". Add a unit test for nothing here (no renderer) — the fallback path is covered by `fallbackStory` tests and the device test (Task 12).

- [ ] **Step 2: The screen** (`app/trip/past.tsx`)

```tsx
/** "Add a trip you've taken" — the whole flow in one modal so the draft stays in memory (spec 2026-10-25). */
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Images } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { AiGeneratingAnimation } from '@/components/trip/AiGeneratingAnimation';
import { useAiConsentGate } from '@/components/ai/useAiConsentGate';
import { usePastTripBuilder } from '@/hooks/usePastTripBuilder';
import { PastTripReview } from '@/components/pastTrip/PastTripReview';
import { PastTripFinish } from '@/components/pastTrip/PastTripFinish';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const STEPS = ['Reading your photos', 'Finding places', 'Writing your story'];

export default function PastTripScreen() {
  const { colors } = useTheme();
  const { requireConsent, consentSheet } = useAiConsentGate();
  const withConsent = useCallback((action: () => void) => requireConsent('agent', action), [requireConsent]);
  const b = usePastTripBuilder({ withConsent });
  const navigation = useNavigation();

  usePreventRemove(b.phase === 'review', ({ data }) => {
    Alert.alert('Discard this trip?', "Nothing has been saved yet.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const onPick = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); b.pick(); }, [b]);

  if (b.phase === 'building' || b.phase === 'saving') {
    return (
      <View style={[styles.center, { backgroundColor: '#0B0A12' }]}>
        <AiGeneratingAnimation progress={b.phase === 'saving' ? b.progress : (b.step + b.progress) / 3} />
        <Text style={[styles.title, { color: '#F5F3F9' }]}>{b.phase === 'saving' ? 'Saving your trip' : 'Building your trip'}</Text>
        <Text style={[styles.body, { color: '#9C95AD' }]}>{b.phase === 'saving' ? 'Adding your photos to each stop' : STEPS[b.step]}</Text>
        {consentSheet}
      </View>
    );
  }
  if (b.phase === 'review' && b.draft) return (<>{<PastTripReview draft={b.draft} onEdit={b.edit} onSave={b.save} error={b.error} noLocations={b.noLocations} />}{consentSheet}</>);
  if (b.phase === 'done' && b.result && b.draft) return <PastTripFinish draft={b.draft} result={b.result} onRetry={b.retryUploads} />;

  return (
    <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
      <Images size={40} weight="duotone" color={colors.brand.purple} />
      <Text style={[styles.title, { color: colors.text.primary }]}>Add a trip you've taken</Text>
      <Text style={[styles.body, { color: colors.text.secondary }]}>Pick the trip's best photos. We use when and where they were taken to build it — locations never leave your phone.</Text>
      {b.error && <Text style={[styles.body, { color: colors.status.error }]}>{b.error}</Text>}
      <Button label="Pick photos" onPress={onPick} />
      <Text style={[styles.caption, { color: colors.text.muted }]}>Up to 100 photos</Text>
      {consentSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['6'], gap: Spacing['3'] },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semibold, letterSpacing: -0.4, textAlign: 'center' },
  body: { fontSize: FontSize.md, lineHeight: 22, textAlign: 'center' },
  caption: { fontSize: FontSize.sm },
});
```

Before writing, check the real names: `AiGeneratingAnimation`'s props (`grep -n "export function AiGeneratingAnimation\|Props" components/trip/AiGeneratingAnimation.tsx`), the `colors.status.error` / `FontSize` keys (`constants/colors.ts`, `constants/typography.ts`), and whether `usePreventRemove` is exported by the installed `@react-navigation/native` (`grep -n usePreventRemove node_modules/@react-navigation/native/lib/typescript/src/index.d.ts`); if not, use `navigation.addListener('beforeRemove', …)` with `e.preventDefault()`. The building screen is always dark (an immersive moment, like AI generation) — add `app/trip/past.tsx` to Architecture Rule 3's list in CLAUDE.md (Task 11).

- [ ] **Step 3: Review screen** (`components/pastTrip/PastTripReview.tsx`, `PastStopCard.tsx`, `MoveToStopSheet.tsx`)

`PastTripReview` props: `{ draft: PastTripDraft; onEdit: (e: PastTripEdit) => void; onSave: (v: TripVisibility) => void; error: string | null; noLocations: boolean }`. Layout (supernova-design: photos lead, eyebrow over title, one primary action):

```tsx
export function PastTripReview({ draft, onEdit, onSave, error, noLocations }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [visibility, setVisibility] = useState<TripVisibility>('followers');
  const [moving, setMoving] = useState<string | null>(null);     // photo id being moved
  const [editing, setEditing] = useState<string | null>(null);   // stop id whose actions are open
  const cover = draft.coverId ? draft.photos[draft.coverId]?.uri : null;
  const stops = draft.days.flatMap((d, di) => d.stops.map((s) => ({ ...s, dayIndex: di })));
  const eyebrow = pastTripEyebrow(draft.days.map((d) => d.day));   // add to utils/pastTrip.ts with a test: "MAY 3 – 7, 2025 · 5 DAYS"
  const save = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSave(visibility); }, [onSave, visibility]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <FlashList
        data={draft.days}
        keyExtractor={(d) => d.day}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        ListHeaderComponent={(
          <View>
            {cover && <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />}
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.text.muted }]}>{eyebrow}</Text>
              <TextInput value={draft.title} onChangeText={(v) => onEdit({ type: 'title', value: v })} maxLength={60}
                style={[styles.title, { color: colors.text.primary }]} accessibilityLabel="Trip title" />
              {noLocations && <Text style={[styles.note, { color: colors.text.secondary }]}>These photos don't say where they were taken. Add places to each day, or drop the photos onto stops you add later.</Text>}
            </View>
          </View>
        )}
        renderItem={({ item: day, index }) => (
          <View style={styles.day}>
            <Text style={[styles.dayHead, { color: colors.text.primary }]}>Day {index + 1}{draft.cities[day.city]?.name ? ` · ${day.stops[0]?.name ?? draft.cities[day.city].name}` : ''}</Text>
            <TextInput value={day.caption} placeholder="Add a caption" placeholderTextColor={colors.text.muted} maxLength={80}
              onChangeText={(v) => onEdit({ type: 'caption', day: index, value: v })} style={[styles.caption, { color: colors.text.secondary }]} accessibilityLabel={`Day ${index + 1} caption`} />
            {day.stops.map((s, si) => (
              <PastStopCard key={s.id} stop={s} photos={draft.photos} first={si === 0}
                onOpen={() => setEditing(s.id)} onMovePhoto={setMoving} onToggleShown={(photoId) => onEdit({ type: 'toggleShown', stopId: s.id, photoId })} />
            ))}
          </View>
        )}
        ListFooterComponent={(
          <View style={[styles.footer, { paddingBottom: insets.bottom + 120 }]}>
            {draft.unplaced.length > 0 && (
              <View>
                <Text style={[styles.dayHead, { color: colors.text.primary }]}>Unplaced photos</Text>
                <Text style={[styles.caption, { color: colors.text.muted }]}>Tap one to put it on a stop. Photos left here aren't saved.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>{draft.unplaced.map((id) => (
                  <Pressable key={id} onPress={() => setMoving(id)} accessibilityLabel="Put this photo on a stop" style={styles.thumbHit}>
                    <Image source={{ uri: draft.photos[id]?.uri }} style={styles.thumb} />
                  </Pressable>
                ))}</ScrollView>
              </View>
            )}
            <VisibilityPicker value={visibility} onChange={setVisibility} />
          </View>
        )}
      />
      <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing['3'], backgroundColor: colors.background.primary, borderTopColor: colors.border.hairline }]}>
        {error && <Text style={{ color: colors.status.error }}>{error}</Text>}
        <Button label="Save trip" onPress={save} />
      </View>
      <MoveToStopSheet visible={!!moving} stops={stops} onPick={(stopId) => { if (moving) onEdit({ type: 'movePhoto', photoId: moving, toStopId: stopId }); setMoving(null); }} onClose={() => setMoving(null)} />
      <StopActionsSheet stop={stops.find((s) => s.id === editing) ?? null} onEdit={onEdit} onClose={() => setEditing(null)} />
    </View>
  );
}
```

- `VisibilityPicker`: reuse the trip form's existing visibility control (`grep -rn "VISIBILITY_ICONS" components | head`) — use the same component the manual wizard (`app/trip/new.tsx`) uses; private accounts can't pick Public (existing rule in that component).
- `PastStopCard`: time + name, `TypeIconBubble` from `ACTIVITY_ICONS[stop.type]`, a horizontal strip of `stop.shownIds` thumbnails (64 pt, radius 12), "10 of 14" badge when `photoIds.length > shownIds.length` (tap → shows all `photoIds`, tap toggles `toggleShown`), long-press a thumbnail → `onMovePhoto(photoId)`. Whole card is a 44 pt+ `Pressable` → `onOpen` with `accessibilityLabel={\`${stop.name}, ${stop.time}\`}`.
- `StopActionsSheet` (inside `PastStopCard.tsx` or its own file): Rename (TextInput, `rename`), Change place (opens the existing place search — `components/trip/AddStopSheet` in search-only mode if it supports a pick callback; otherwise a `TextInput` that runs `searchPlaceInBounds` around the stop and offers the top 5 → `place`), Merge with the stop before (hidden on a day's first stop → `mergeWithPrevious`), Delete stop (destructive → `deleteStop`). Native action sheet on iOS (`ActionSheetIOS`) like `useOwnPostActions`, a bottom sheet on Android.
- `MoveToStopSheet`: a bottom sheet listing every stop as "Day 2 · 13:10 · Time Out Market" rows (≥ 44 pt, Light haptic) → `onPick(stopId)`.
- Motion: list rows and sheets use the house spring (`Animated.spring(..., { tension: 65, friction: 11 })`) on mount, as `ScreenEntrance` does.

Add `pastTripEyebrow(days: string[]): string` to `utils/pastTrip.ts` with this test appended to `__tests__/utils/pastTrip.test.ts` first (RED → GREEN):

```ts
import { pastTripEyebrow } from '@/utils/pastTrip';
it('eyebrow', () => {
  expect(pastTripEyebrow(['2025-05-03', '2025-05-04', '2025-05-05', '2025-05-06', '2025-05-07'])).toBe('MAY 3 – 7, 2025 · 5 DAYS');
  expect(pastTripEyebrow(['2025-05-31', '2025-06-01'])).toBe('MAY 31 – JUN 1, 2025 · 2 DAYS');
  expect(pastTripEyebrow(['2025-12-31', '2026-01-01'])).toBe('DEC 31, 2025 – JAN 1, 2026 · 2 DAYS');
  expect(pastTripEyebrow(['2025-05-03'])).toBe('MAY 3, 2025 · 1 DAY');
});
```

```ts
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function pastTripEyebrow(days: string[]): string {
  if (!days.length) return '';
  const [y1, m1, d1] = days[0].split('-').map(Number);
  const [y2, m2, d2] = days[days.length - 1].split('-').map(Number);
  const n = days.length === 1 ? '1 DAY' : `${days.length} DAYS`;
  if (days.length === 1) return `${MON[m1 - 1]} ${d1}, ${y1} · ${n}`;
  if (y1 !== y2) return `${MON[m1 - 1]} ${d1}, ${y1} – ${MON[m2 - 1]} ${d2}, ${y2} · ${n}`;
  if (m1 !== m2) return `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}, ${y1} · ${n}`;
  return `${MON[m1 - 1]} ${d1} – ${d2}, ${y1} · ${n}`;
}
```

- [ ] **Step 4: Finish screen** (`components/pastTrip/PastTripFinish.tsx`)

```tsx
export function PastTripFinish({ draft, result, onRetry }: { draft: PastTripDraft; result: { saved: SavedPastTrip }; onRetry: () => Promise<void> }) {
  const { colors } = useTheme();
  const [retrying, setRetrying] = useState(false);
  const city = draft.cities[0]?.name || 'new';
  const tripId = result.saved.tripId;
  const failed = result.saved.failed.length;
  const open = useCallback((path: string) => { if (router.canDismiss()) router.dismissAll(); router.push(path as never); }, []);
  const retry = useCallback(async () => { setRetrying(true); await onRetry(); setRetrying(false); }, [onRetry]);
  return (
    <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
      <CheckCircle size={40} weight="duotone" color={colors.accent.teal} />
      <Text style={[styles.title, { color: colors.text.primary }]}>Your {city} trip is saved.</Text>
      {failed > 0 && (
        <Pressable onPress={retry} disabled={retrying} accessibilityLabel="Try uploading the photos again" style={styles.retry}>
          <Text style={{ color: colors.status.error }}>{failed} {failed === 1 ? "photo didn't" : "photos didn't"} upload · {retrying ? 'Trying…' : 'Try again'}</Text>
        </Pressable>
      )}
      <Button label="Make the video" onPress={() => open(`/trip/${tripId}?video=1`)} />
      <Button label="Post to the feed" variant="secondary" onPress={() => open(`/post/create-photo?tripId=${tripId}`)} />
      <Pressable onPress={() => open(`/trip/${tripId}`)} accessibilityLabel="View trip" style={styles.link}>
        <Text style={{ color: colors.text.secondary }}>View trip</Text>
      </Pressable>
    </View>
  );
}
```

Before writing, check the real deep links: how the trip map's video sheet is opened (`grep -n "openVideo\|video" app/trip/\[id\].tsx | head`) — if `trip/[id]` has no `video` param, add one: on mount with `video=1`, open the map and call its `openVideo` (the TripMapView exposes the video button; wire a prop `startWithVideo` that sets `film` to `'confirm'` once). And how a post links a trip with photos (`grep -rn "tripId" app/post/create-photo.tsx | head`); pass the cover URL if the composer takes a preset photo, otherwise open it with the trip attached and let the person choose photos.

- [ ] **Step 5: Register the route and the Android permission**

`app/_layout.tsx`, next to `trip/new`:

```tsx
        <Stack.Screen name="trip/past" options={{ presentation: 'modal' }} />
```

`app.json` → `expo.android.permissions` add `"android.permission.ACCESS_MEDIA_LOCATION"` (keep the existing entries). Without it Android removes GPS from picked photos' EXIF.

- [ ] **Step 6: Type check, lint, tests**

Run: `npx tsc --noEmit -p . && npx eslint app/trip/past.tsx components/pastTrip hooks/usePastTripBuilder.ts && npx jest`
Expected: no type errors, no new lint errors, all tests PASS

- [ ] **Step 7: Commit**

```bash
git add hooks/usePastTripBuilder.ts app/trip/past.tsx components/pastTrip app/_layout.tsx app.json utils/pastTrip.ts __tests__/utils/pastTrip.test.ts components/ai/useAiConsentGate.tsx app/trip/[id].tsx components/trip/TripMapView.tsx
git commit -m "feat(past-trips): pick, build, review and save a past trip"
```

Run the supernova-design pre-ship checklist on these screens and note each line in the commit body (no emoji, one primary action per screen, empty/edge states, eyebrow, ≥ 20 px margins, spring motion, haptics, 44 pt, theme colors, sentence case).

---

### Task 10: Entry points — Create tab and "Been there"

**Files:**
- Modify: `app/(tabs)/create.tsx:42-56` (a third secondary option)
- Modify: `app/(tabs)/profile.tsx:52-64, 333, 389-396` ('Past' → 'Been there', summary line, empty-state action)
- Create: `utils/beenThere.ts`
- Test: `__tests__/utils/beenThere.test.ts`

**Interfaces:**
- Produces: `export function beenThereSummary(trips: { destination?: { countryCode?: string | null } | null; additionalDestinations?: { countryCode?: string | null }[] | null }[]): string` → `"12 trips · 9 countries"`, `"1 trip · 1 country"`, `""` for none.

- [ ] **Step 1: Write the failing test**

```ts
import { beenThereSummary } from '@/utils/beenThere';

describe('beenThereSummary', () => {
  it('counts trips and distinct countries across every city', () => {
    expect(beenThereSummary([
      { destination: { countryCode: 'PT' }, additionalDestinations: [{ countryCode: 'ES' }] },
      { destination: { countryCode: 'pt' } },
      { destination: { countryCode: null } },
    ])).toBe('3 trips · 2 countries');
  });
  it('singular and empty', () => {
    expect(beenThereSummary([{ destination: { countryCode: 'GB' } }])).toBe('1 trip · 1 country');
    expect(beenThereSummary([{ destination: null }])).toBe('1 trip');
    expect(beenThereSummary([])).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/beenThere.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
/** The profile's "Been there" line: trips and distinct countries (spec 2026-10-25-past-trips-from-photos). */
type T = { destination?: { countryCode?: string | null } | null; additionalDestinations?: { countryCode?: string | null }[] | null };

export function beenThereSummary(trips: T[]): string {
  if (!trips.length) return '';
  const countries = new Set<string>();
  for (const t of trips) for (const c of [t.destination, ...(t.additionalDestinations ?? [])]) if (c?.countryCode) countries.add(c.countryCode.toUpperCase());
  const tripsText = `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`;
  return countries.size ? `${tripsText} · ${countries.size} ${countries.size === 1 ? 'country' : 'countries'}` : tripsText;
}
```

- [ ] **Step 4: Wire the screens**

`app/(tabs)/create.tsx` — add to `secondaryOptions`, before "Get inspired" (import `Images` from `phosphor-react-native`):

```ts
    {
      Icon: Images,
      iconColor: colors.brand.pink,
      title: "Add a trip you've taken",
      description: 'Turn your photos into a trip',
      onPress: () => router.push('/trip/past'),
    },
```

`app/(tabs)/profile.tsx`:
- `type TripFilter = 'Upcoming' | 'Current' | 'Been there';` and update `TRIP_STATUS_MAP` (`'Been there': 'completed'`), the chip list at line 333, and `EMPTY_COPY['Been there'] = { title: "Add a trip you've taken", description: 'Turn your photos into a trip' }`.
- Empty state action: `actionLabel={tripFilter === 'Been there' ? 'Add a trip' : 'Create a trip'}` and `onAction={() => router.push(tripFilter === 'Been there' ? '/trip/past' : '/trip/new')}`.
- Above the list when `tripFilter === 'Been there'` and there are trips: an eyebrow-style line `beenThereSummary(filteredTrips)` (11 pt, uppercase, tracked, muted) plus a small text action "Add a trip" → `/trip/past`. Put it in the `headerComponent` under the filter row.
- Check `grep -rn "'Past'" app components` for any other use of the old filter name and update it.

- [ ] **Step 5: Tests and type check**

Run: `npx jest && npx tsc --noEmit -p .`
Expected: PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/create.tsx" "app/(tabs)/profile.tsx" utils/beenThere.ts __tests__/utils/beenThere.test.ts
git commit -m "feat(past-trips): Create tab option and Been there on the profile"
```

---

### Task 11: Docs and privacy policy

**Files:**
- Modify: `CLAUDE.md` (Cloud Functions list: `pastTripStory`; trending line: past trips; Utils/Services: past trips bullet; Architecture Rule 3: `app/trip/past.tsx` building/saving screens are always dark; journal cap 10; routing tree: `trip/past.tsx`)
- Modify: `hosting/privacy.html` (photo locations)

- [ ] **Step 1: CLAUDE.md** — add under Cloud Functions:

```markdown
- **Past trips from photos** (spec `docs/superpowers/specs/2026-10-25-past-trips-from-photos-design.md`; pure `utils/photoMeta.ts`, `utils/pastTrip.ts`, `utils/pastTripEdits.ts`, `utils/pastTripDocs.ts`, `utils/pastTripPlaces.ts`; `services/pastTripPlaces.ts`, `services/pastTrip.ts`; `hooks/usePastTripBuilder.ts`; screen `app/trip/past.tsx`; callable `pastTripStory` in `functions/src/pastTripStory*.ts`) — free. Picker (≤ 100, `exif: true`, never library access; Android `ACCESS_MEDIA_LOCATION`) → days = printed EXIF dates, stops at > 250 m / > 90 min, cities at > 50 km → Mapbox names (POI ≤ 100 m, else neighbourhood, else "Stop n") → Nova title/captions from names and times only (one message of the Nova allowance, consent `agent`; failure → "Trip to {city}") → review (rename, change place, merge, delete, move photos, ≤ 10 shown a stop) → trip doc, then days+stops in one batch (trip deleted if it fails — rules' `get()` can't see a parent made in the same batch), then photos re-encoded (no metadata/location) to `journal_photos/{uid}/{tripId}/{stopId}/{photoId}.jpg` and each stop's `journal/entry`, then the cover. `trips.source = 'photos'`. **Photo coordinates never leave the phone.** Past trips (ended): profile "Been there" (`utils/beenThere.ts`), no trip check (`shouldRunTripCheck`), not trending (`endedBeforeCreated`). Booking matching is unchanged on purpose: only bookings from the trip's own dates can match it
```

- [ ] **Step 2: Privacy policy** — in `hosting/privacy.html`, in the section about photos (find it with `grep -n -i "photo" hosting/privacy.html | head`), add:

```html
<p>When you add a trip you've taken from your photos, the app reads when and where each photo was taken on your phone to build the trip. Photo locations are not uploaded or stored; photos are uploaded without their location. On Android this uses the "access photo locations" permission.</p>
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md hosting/privacy.html
git commit -m "docs(past-trips): CLAUDE.md and privacy policy"
```

---

### Task 12: Deploy, build and test on a phone (owner go-ahead needed)

**Files:** none new.

- [ ] **Step 1: Final review** — the executing skill's whole-branch review runs here, before anything is deployed.

- [ ] **Step 2: Ask the owner** for the go-ahead to deploy the server pieces and start builds. Then:

```bash
cd functions && npm run build && npx firebase deploy --only functions:pastTripStory,functions:onTripWrittenTrend
cd .. && npx firebase deploy --only hosting
```

Expected: both deploy OK. Check `pastTripStory` answers a signed-in call (it is a v2 callable; if the first call returns 401 from Cloud Run, add `invoker: 'public'` to its options and redeploy — this happened with `claimAndroidGift`).

- [ ] **Step 3: Builds** (with the owner's OK): `npx eas-cli build --platform ios --profile production --auto-submit --non-interactive --no-wait` and the Android equivalent to the internal track.

- [ ] **Step 4: Device check, iPhone and Android** — the spec's spike, done on the first build:
  1. Create → Add a trip you've taken → pick 20–40 photos of a real trip. **Do stops appear on the map?** If iOS gives no GPS in `exif`, the fallback is `expo-media-library` `getAssetInfoAsync(assetId)` (`location`) with limited access to the selected photos — stop and report to the owner before building it.
  2. Review: rename a stop, merge two, move a photo, drop an unplaced photo on a stop, swap shown photos on a busy stop.
  3. Save → finish screen → Make the video: the photos appear at their stops; playback too.
  4. Turn on airplane mode during upload → "N photos didn't upload · Try again" → back online → Try again.
  5. Profile → Been there shows the trip and the summary line.
  6. Check one uploaded photo has no location: download it from Storage and run `exiftool` (or `mdls`) on it.

- [ ] **Step 5: Report** to the owner with what passed and any finding.
