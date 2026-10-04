# Wallet ↔ Trips Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro users' bookings link themselves to the right trip (or ask), and show on that trip's days with their confirmation details, visible only to the booking's owner.

**Architecture:** One pure matcher on the server (`functions/src/bookingMatch.ts`) used by a `matchBooking` callable (called by the app right after a save) and an `onTripWrittenRematch` trigger (trip created / dates or places changed / deleted). Links live on the wallet item (`tripId`, `tripLink`, `tripSuggestions`, `tripLinkDismissed`). The trip page queries the viewer's own linked items and places them on days with the pure `utils/bookingDays.ts`.

**Tech Stack:** Expo Router v6, TanStack Query, Zustand, Firestore rules, Cloud Functions v2 (`onCall`, `onDocumentWritten`), Jest.

**Spec:** `docs/superpowers/specs/2026-10-03-wallet-trip-matching-design.md`

## Global Constraints

- **Pro only:** matching never runs for a free account; free users' "Add to a trip" opens the paywall (`useProGate().openPaywall`). Paid = `tier` `pro` or `business` (`isPaidTier`).
- **Private:** a booking shows on a trip only to its owner — queries always filter `ownerUid == me`.
- Bookings never add or remove itinerary stops.
- `tripLink: 'manual'` links are never changed automatically; `tripLinkDismissed: true` items are never auto-matched again.
- "Dates TBD" trips (no `startDate`/`endDate`) are never auto-matched; manual linking works.
- Calendar dates are `YYYY-MM-DD` strings; never coerce `TripActivity.startTime` to a Date (Architecture Rule 13).
- Design: no emoji; semantic icons from `constants/icons.ts`; `BOOKED` eyebrow (11pt, 0.08em tracking, muted); hairlines; house spring; Light haptic on link/unlink, Medium on Undo; colors via `useTheme()`; sentence case.
- New Firestore query shapes get a declared composite index in `firestore.indexes.json`.
- Deploy only what changed: `firestore:rules,firestore:indexes,functions:matchBooking,functions:onTripWrittenRematch,functions:parseTravelConfirmation`.

## Review Focus

1. **A trip edit that isn't about dates or places** (likes, cover backfill, title) must not re-run matching for every member — cost scales with engagement. → `tripMatchInputsChanged` test (Task 1).
2. **A European user's trip** (start stored as local midnight = previous day in UTC) must still match a hotel that checks in on the first day. → `tripWindow` ±1 day test (Task 1).
3. **A return flight home** (Rome → JFK on the last day) must still match the Rome trip. → `placeMatches` origin test (Task 1).
4. **Two hotels in the same city** — the itinerary's "Hotel Artemide" stop must not take the details of a "Hotel Quirinale" booking. → `bookingMatchesStop` test (Task 3).
5. **A free user (or a lapsed Pro)** writing `tripId` directly must be refused by rules, but must still be able to remove a link. → rules dry-run + emulator-free check via the rule text (Task 2) and `linkPatch` tests (Task 4).

---

### Task 1: Server matcher (pure)

**Files:**
- Create: `functions/src/bookingMatch.ts`
- Test: `__tests__/functions/bookingMatch.test.ts`

**Interfaces — Produces:**
```ts
export interface BookingPlace { city?: string | null; countryCode?: string | null }
export interface MatchableBooking {
  kind: 'boarding_pass' | 'reservation';
  localDate?: string | null; departureTime?: string | null;      // flights
  checkIn?: string | null; checkOut?: string | null;              // reservations
  placeCity?: string | null; placeCountryCode?: string | null;
  originCity?: string | null; originCountryCode?: string | null;  // flights
  tripId?: string | null; tripLink?: 'auto' | 'manual' | null; tripLinkDismissed?: boolean;
}
export interface MatchableTrip {
  id: string; title: string;
  start: string | null; end: string | null;                       // YYYY-MM-DD (UTC day of the stored Timestamp)
  places: BookingPlace[];                                          // destination + additionalDestinations
}
export type MatchDecision = { kind: 'link'; tripId: string } | { kind: 'ask'; tripIds: string[] } | { kind: 'none' };
export function foldName(s: string): string;
export function dayNumber(date: string): number;                  // YYYY-MM-DD → days since epoch
export function calendarDay(value: string | null | undefined): string | null; // YYYY-MM-DD or ISO → YYYY-MM-DD (UTC)
export function bookingWindow(b: MatchableBooking): { start: number; end: number; places: BookingPlace[] } | null;
export function tripWindow(t: MatchableTrip): { start: number; end: number } | null;
export function placeMatches(bookingPlaces: BookingPlace[], tripPlaces: BookingPlace[]): boolean | null;
export function matchDecision(b: MatchableBooking, trips: MatchableTrip[]): MatchDecision;
export function rematchable(b: MatchableBooking, tripId: string): boolean;
export function linkPatchFor(b: MatchableBooking, d: MatchDecision, changedTripId?: string):
  Record<string, unknown> | null;
export function tripMatchInputsChanged(before: Record<string, any> | undefined, after: Record<string, any> | undefined): boolean;
```

- [ ] **Step 1: Write the failing tests**

```ts
import {
  foldName, calendarDay, bookingWindow, tripWindow, placeMatches, matchDecision,
  rematchable, linkPatchFor, tripMatchInputsChanged, type MatchableTrip,
} from '../../functions/src/bookingMatch';

const rome: MatchableTrip = { id: 'rome', title: 'Rome in Spring', start: '2026-07-25', end: '2026-07-30',
  places: [{ city: 'Rome', countryCode: 'IT' }] };
const lisbon: MatchableTrip = { id: 'lis', title: 'Lisbon', start: '2026-07-26', end: '2026-07-29',
  places: [{ city: 'Lisbon', countryCode: 'PT' }] };
const tbd: MatchableTrip = { id: 'tbd', title: 'Someday', start: null, end: null, places: [{ city: 'Rome', countryCode: 'IT' }] };

describe('foldName / calendarDay', () => {
  it('folds accents, case and city aliases', () => {
    expect(foldName('Roma')).toBe(foldName('Rome'));
    expect(foldName('München')).toBe(foldName('Munich'));
    expect(foldName('  LISBOA ')).toBe(foldName('Lisbon'));
    expect(foldName('Washington, DC')).toBe('washington');
  });
  it('reads a calendar day from a date or an ISO instant (UTC day)', () => {
    expect(calendarDay('2026-07-25')).toBe('2026-07-25');
    expect(calendarDay('2026-07-25T23:30:00.000Z')).toBe('2026-07-25');
    expect(calendarDay('nonsense')).toBeNull();
    expect(calendarDay(null)).toBeNull();
  });
});

describe('bookingWindow / tripWindow', () => {
  it('a flight spans its local day ±1 (overnight arrivals, timezones)', () => {
    const w = bookingWindow({ kind: 'boarding_pass', localDate: '2026-07-25', placeCity: 'Rome' })!;
    expect(w.end - w.start).toBe(2);
  });
  it('a flight without localDate falls back to the departure instant', () => {
    expect(bookingWindow({ kind: 'boarding_pass', departureTime: '2026-07-25T08:10:00Z' })).not.toBeNull();
  });
  it('a reservation spans check-in to check-out, or just check-in', () => {
    const w = bookingWindow({ kind: 'reservation', checkIn: '2026-07-25', checkOut: '2026-07-28' })!;
    expect(w.end - w.start).toBe(3);
    const one = bookingWindow({ kind: 'reservation', checkIn: '2026-07-25' })!;
    expect(one.end).toBe(one.start);
  });
  it('a booking with no dates has no window', () => {
    expect(bookingWindow({ kind: 'reservation' })).toBeNull();
  });
  it('a trip window is padded a day each side (start stored as local midnight lands on the previous UTC day east of UTC)', () => {
    const w = tripWindow({ ...rome, start: '2026-07-24', end: '2026-07-29' })!;
    const hotel = bookingWindow({ kind: 'reservation', checkIn: '2026-07-30', checkOut: '2026-07-30' })!;
    expect(hotel.start <= w.end).toBe(true);
  });
  it('a Dates TBD trip has no window', () => {
    expect(tripWindow(tbd)).toBeNull();
  });
});

describe('placeMatches', () => {
  it('matches on country, or on city name with aliases', () => {
    expect(placeMatches([{ countryCode: 'IT' }], rome.places)).toBe(true);
    expect(placeMatches([{ city: 'Roma' }], rome.places)).toBe(true);
    expect(placeMatches([{ city: 'Paris', countryCode: 'FR' }], rome.places)).toBe(false);
  });
  it('unknown place is null, not false', () => {
    expect(placeMatches([{}], rome.places)).toBeNull();
    expect(placeMatches([], rome.places)).toBeNull();
  });
  it('a flight home matches on its origin', () => {
    const w = bookingWindow({ kind: 'boarding_pass', localDate: '2026-07-30',
      placeCity: 'New York', placeCountryCode: 'US', originCity: 'Rome', originCountryCode: 'IT' })!;
    expect(placeMatches(w.places, rome.places)).toBe(true);
  });
});

describe('matchDecision', () => {
  const hotel = { kind: 'reservation' as const, checkIn: '2026-07-25', checkOut: '2026-07-28', placeCity: 'Roma', placeCountryCode: 'IT' };
  it('one trip fits on dates and place: link it', () => {
    expect(matchDecision(hotel, [rome, lisbon, tbd])).toEqual({ kind: 'link', tripId: 'rome' });
  });
  it('two trips fit: ask, closest start first', () => {
    const rome2 = { ...rome, id: 'rome2', start: '2026-07-20', end: '2026-07-31' };
    expect(matchDecision(hotel, [rome2, rome])).toEqual({ kind: 'ask', tripIds: ['rome', 'rome2'] });
  });
  it('dates fit but the place is unknown: ask', () => {
    expect(matchDecision({ kind: 'reservation', checkIn: '2026-07-26' }, [rome, lisbon]))
      .toEqual({ kind: 'ask', tripIds: ['lis', 'rome'] });
  });
  it('dates fit, place known and different: none', () => {
    expect(matchDecision({ ...hotel, placeCity: 'Paris', placeCountryCode: 'FR' }, [rome])).toEqual({ kind: 'none' });
  });
  it('Dates TBD trips and undated bookings never match', () => {
    expect(matchDecision(hotel, [tbd])).toEqual({ kind: 'none' });
    expect(matchDecision({ kind: 'reservation', placeCity: 'Rome' }, [rome])).toEqual({ kind: 'none' });
  });
  it('asks about at most three trips', () => {
    const many = [1, 2, 3, 4].map((i) => ({ ...rome, id: `r${i}` }));
    const d = matchDecision({ kind: 'reservation', checkIn: '2026-07-26' }, many);
    expect(d.kind === 'ask' && d.tripIds.length).toBe(3);
  });
});

describe('rematchable / linkPatchFor', () => {
  it('re-decides unlinked bookings and auto links to the changed trip, never manual or dismissed', () => {
    expect(rematchable({ kind: 'reservation' }, 'rome')).toBe(true);
    expect(rematchable({ kind: 'reservation', tripId: 'rome', tripLink: 'auto' }, 'rome')).toBe(true);
    expect(rematchable({ kind: 'reservation', tripId: 'lis', tripLink: 'auto' }, 'rome')).toBe(false);
    expect(rematchable({ kind: 'reservation', tripId: 'rome', tripLink: 'manual' }, 'rome')).toBe(false);
    expect(rematchable({ kind: 'reservation', tripLinkDismissed: true }, 'rome')).toBe(false);
  });
  it('writes only what changes', () => {
    expect(linkPatchFor({ kind: 'reservation' }, { kind: 'link', tripId: 'rome' }))
      .toEqual({ tripId: 'rome', tripLink: 'auto', tripSuggestions: [] });
    expect(linkPatchFor({ kind: 'reservation', tripId: 'rome', tripLink: 'auto' }, { kind: 'link', tripId: 'rome' })).toBeNull();
    expect(linkPatchFor({ kind: 'reservation' }, { kind: 'ask', tripIds: ['a', 'b'] }))
      .toEqual({ tripSuggestions: ['a', 'b'] });
    expect(linkPatchFor({ kind: 'reservation' }, { kind: 'none' })).toBeNull();
  });
  it('an auto link to a trip that no longer fits is removed', () => {
    expect(linkPatchFor({ kind: 'reservation', tripId: 'rome', tripLink: 'auto' }, { kind: 'none' }, 'rome'))
      .toEqual({ tripId: null, tripLink: null, tripSuggestions: [] });
  });
});

describe('tripMatchInputsChanged', () => {
  const t = { startDate: { toMillis: () => 1 }, endDate: { toMillis: () => 2 }, destination: { name: 'Rome', countryCode: 'IT' },
    additionalDestinations: [], collaborators: [], likesCount: 0 };
  it('created, deleted, dates, places or members changed: yes', () => {
    expect(tripMatchInputsChanged(undefined, t)).toBe(true);
    expect(tripMatchInputsChanged(t, undefined)).toBe(true);
    expect(tripMatchInputsChanged(t, { ...t, endDate: { toMillis: () => 3 } })).toBe(true);
    expect(tripMatchInputsChanged(t, { ...t, destination: { name: 'Milan', countryCode: 'IT' } })).toBe(true);
    expect(tripMatchInputsChanged(t, { ...t, collaborators: ['x'] })).toBe(true);
  });
  it('likes, covers, titles: no', () => {
    expect(tripMatchInputsChanged(t, { ...t, likesCount: 5, coverImageUrl: 'x', title: 'New' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/functions/bookingMatch.test.ts`
Expected: FAIL — `Cannot find module '../../functions/src/bookingMatch'`.

- [ ] **Step 3: Implement**

```ts
/**
 * Which trip a wallet booking belongs to. Pure — no firebase-admin — so it is
 * unit-tested; used by matchBooking (bookingMatchFunctions.ts) and the trip
 * rematch trigger. Design: docs/superpowers/specs/2026-10-03-wallet-trip-matching-design.md
 */

export interface BookingPlace { city?: string | null; countryCode?: string | null }
export interface MatchableBooking {
  kind: 'boarding_pass' | 'reservation';
  localDate?: string | null; departureTime?: string | null;
  checkIn?: string | null; checkOut?: string | null;
  placeCity?: string | null; placeCountryCode?: string | null;
  originCity?: string | null; originCountryCode?: string | null;
  tripId?: string | null; tripLink?: 'auto' | 'manual' | null; tripLinkDismissed?: boolean;
}
export interface MatchableTrip { id: string; title: string; start: string | null; end: string | null; places: BookingPlace[] }
export type MatchDecision = { kind: 'link'; tripId: string } | { kind: 'ask'; tripIds: string[] } | { kind: 'none' };

const MAX_ASK = 3;
const DAY_MS = 86_400_000;

/** Local spellings travellers meet on confirmations → the name trips use. */
const CITY_ALIASES: Record<string, string> = {
  roma: 'rome', munchen: 'munich', lisboa: 'lisbon', firenze: 'florence', venezia: 'venice', milano: 'milan',
  napoli: 'naples', praha: 'prague', wien: 'vienna', koln: 'cologne', bruxelles: 'brussels', brussel: 'brussels',
  kobenhavn: 'copenhagen', warszawa: 'warsaw', athina: 'athens', sevilla: 'seville', moskva: 'moscow',
  'new york city': 'new york', nyc: 'new york', 'ciudad de mexico': 'mexico city', cdmx: 'mexico city',
};

export function foldName(s: string): string {
  const first = s.split(',')[0];
  const folded = first.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return CITY_ALIASES[folded] ?? folded;
}

export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function calendarDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

export function bookingWindow(b: MatchableBooking) {
  const places: BookingPlace[] = [{ city: b.placeCity, countryCode: b.placeCountryCode }];
  if (b.kind === 'boarding_pass') {
    const day = calendarDay(b.localDate) ?? calendarDay(b.departureTime);
    if (!day) return null;
    places.push({ city: b.originCity, countryCode: b.originCountryCode });
    const n = dayNumber(day);
    return { start: n - 1, end: n + 1, places };
  }
  const inDay = calendarDay(b.checkIn);
  if (!inDay) return null;
  const outDay = calendarDay(b.checkOut) ?? inDay;
  return { start: dayNumber(inDay), end: Math.max(dayNumber(inDay), dayNumber(outDay)), places };
}

export function tripWindow(t: MatchableTrip) {
  if (!t.start || !t.end) return null;
  return { start: dayNumber(t.start) - 1, end: dayNumber(t.end) + 1 };
}

export function placeMatches(bookingPlaces: BookingPlace[], tripPlaces: BookingPlace[]): boolean | null {
  const known = bookingPlaces.filter((p) => p.city || p.countryCode);
  if (known.length === 0) return null;
  return known.some((bp) => tripPlaces.some((tp) =>
    (!!bp.countryCode && !!tp.countryCode && bp.countryCode.toUpperCase() === tp.countryCode.toUpperCase())
    || (!!bp.city && !!tp.city && foldName(bp.city) === foldName(tp.city))));
}

export function matchDecision(b: MatchableBooking, trips: MatchableTrip[]): MatchDecision {
  const bw = bookingWindow(b);
  if (!bw) return { kind: 'none' };
  const overlapping = trips
    .map((t) => ({ t, w: tripWindow(t) }))
    .filter((x): x is { t: MatchableTrip; w: { start: number; end: number } } =>
      !!x.w && x.w.start <= bw.end && bw.start <= x.w.end)
    // closest start first: the likeliest trip leads the "Is this for a trip?" card
    .sort((a, c) => Math.abs(a.w.start - bw.start) - Math.abs(c.w.start - bw.start) || a.t.id.localeCompare(c.t.id));
  const sure = overlapping.filter((x) => placeMatches(bw.places, x.t.places) === true);
  if (sure.length === 1) return { kind: 'link', tripId: sure[0].t.id };
  if (sure.length > 1) return { kind: 'ask', tripIds: sure.slice(0, MAX_ASK).map((x) => x.t.id) };
  const unknown = overlapping.filter((x) => placeMatches(bw.places, x.t.places) === null);
  if (unknown.length > 0) return { kind: 'ask', tripIds: unknown.slice(0, MAX_ASK).map((x) => x.t.id) };
  return { kind: 'none' };
}

/** Whether a change to `tripId` may re-decide this booking. Manual and dismissed never. */
export function rematchable(b: MatchableBooking, tripId: string): boolean {
  if (b.tripLinkDismissed || b.tripLink === 'manual') return false;
  return !b.tripId || b.tripId === tripId;
}

/** The fields to write for a decision, or null when nothing changes. */
export function linkPatchFor(b: MatchableBooking, d: MatchDecision, changedTripId?: string): Record<string, unknown> | null {
  if (d.kind === 'link') {
    return b.tripId === d.tripId && b.tripLink === 'auto' ? null : { tripId: d.tripId, tripLink: 'auto', tripSuggestions: [] };
  }
  const unlink = !!changedTripId && b.tripId === changedTripId && b.tripLink === 'auto';
  if (d.kind === 'ask') {
    return unlink ? { tripId: null, tripLink: null, tripSuggestions: d.tripIds } : { tripSuggestions: d.tripIds };
  }
  return unlink ? { tripId: null, tripLink: null, tripSuggestions: [] } : null;
}

/** Only these trip edits can change a match — likes, covers and titles can't. */
export function tripMatchInputsChanged(before: Record<string, any> | undefined, after: Record<string, any> | undefined): boolean {
  if (!before || !after) return true;
  const ms = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : null);
  const places = (t: Record<string, any>) => JSON.stringify([
    [t.destination?.name ?? null, t.destination?.countryCode ?? null],
    ...((t.additionalDestinations ?? []) as any[]).map((d) => [d?.name ?? null, d?.countryCode ?? null]),
  ]);
  return ms(before.startDate) !== ms(after.startDate)
    || ms(before.endDate) !== ms(after.endDate)
    || places(before) !== places(after)
    || JSON.stringify(before.collaborators ?? []) !== JSON.stringify(after.collaborators ?? []);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/functions/bookingMatch.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add functions/src/bookingMatch.ts __tests__/functions/bookingMatch.test.ts
git commit -m "feat: wallet booking ↔ trip matcher (pure)"
```

---

### Task 2: Server wiring — callable, trigger, parser fields, rules, indexes

**Files:**
- Create: `functions/src/bookingMatchFunctions.ts`
- Modify: `functions/src/index.ts` (export), `functions/src/parseTravelConfirmation.ts` (prompt), `functions/src/types.ts` (result fields), `types/ai.ts` (same fields), `firestore.rules` (boarding_passes, reservations), `firestore.indexes.json`
- Test: `__tests__/functions/bookingMatch.test.ts` (add `toMatchableTrip` cases)

**Interfaces:**
- Consumes (Task 1): `matchDecision`, `linkPatchFor`, `rematchable`, `tripMatchInputsChanged`, `calendarDay`, `MatchableTrip`, `MatchableBooking`.
- Produces: callable `matchBooking({ kind: 'boarding_pass' | 'reservation', id: string })` →
  `{ kind: 'link'; trip: TripSummary } | { kind: 'ask'; trips: TripSummary[] } | { kind: 'none' }` where
  `TripSummary = { tripId: string; title: string; start: string | null; end: string | null }`.
  Pure `toMatchableTrip(id: string, data: Record<string, any>): MatchableTrip` exported from `bookingMatch.ts`.
  Parser fields: boarding pass `originCountryCode`, `destinationCountryCode`, `departureLocalDate`; reservation `city`, `countryCode`.

- [ ] **Step 1: Failing test for `toMatchableTrip`** (append to `__tests__/functions/bookingMatch.test.ts`, and add `toMatchableTrip` to its import)

```ts
describe('toMatchableTrip', () => {
  it('reads dates as UTC days and every destination as a place', () => {
    const t = toMatchableTrip('rome', {
      title: 'Rome', startDate: { toDate: () => new Date('2026-07-24T22:00:00Z') }, endDate: { toDate: () => new Date('2026-07-29T22:00:00Z') },
      destination: { name: 'Rome', countryCode: 'IT' }, additionalDestinations: [{ name: 'Florence', countryCode: 'IT' }],
    });
    expect(t).toEqual({ id: 'rome', title: 'Rome', start: '2026-07-24', end: '2026-07-29',
      places: [{ city: 'Rome', countryCode: 'IT' }, { city: 'Florence', countryCode: 'IT' }] });
  });
  it('a trip without dates is Dates TBD', () => {
    expect(toMatchableTrip('x', { title: 'X', destination: { name: 'Rome' } }).start).toBeNull();
  });
});
```

Run: `npx jest __tests__/functions/bookingMatch.test.ts` → Expected: FAIL (`toMatchableTrip` is not a function).

- [ ] **Step 2: Implement `toMatchableTrip`** (append to `functions/src/bookingMatch.ts`)

```ts
export function toMatchableTrip(id: string, data: Record<string, any>): MatchableTrip {
  const day = (v: any) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString().slice(0, 10) : null);
  const dest = (d: any): BookingPlace => ({ city: d?.name ?? null, countryCode: d?.countryCode ?? null });
  return {
    id,
    title: String(data.title ?? ''),
    start: day(data.startDate),
    end: day(data.endDate),
    places: [dest(data.destination), ...((data.additionalDestinations ?? []) as any[]).map(dest)],
  };
}
```

Run the test → Expected: PASS.

- [ ] **Step 3: Write `functions/src/bookingMatchFunctions.ts`**

```ts
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  linkPatchFor, matchDecision, rematchable, toMatchableTrip, tripMatchInputsChanged,
  type MatchableBooking, type MatchableTrip,
} from './bookingMatch';

const db = admin.firestore();
const COLLECTIONS = { boarding_pass: 'boarding_passes', reservation: 'reservations' } as const;
type Kind = keyof typeof COLLECTIONS;

async function isPaid(uid: string): Promise<boolean> {
  const tier = (await db.doc(`users/${uid}`).get()).data()?.tier;
  return tier === 'pro' || tier === 'business';
}

/** Trips a user can attach bookings to: their own and ones they're on. */
async function tripsFor(uid: string): Promise<MatchableTrip[]> {
  const [own, shared] = await Promise.all([
    db.collection('trips').where('authorUid', '==', uid).get(),
    db.collection('trips').where('collaborators', 'array-contains', uid).get(),
  ]);
  const byId = new Map<string, MatchableTrip>();
  for (const d of [...own.docs, ...shared.docs]) byId.set(d.id, toMatchableTrip(d.id, d.data()));
  return [...byId.values()];
}

const summary = (t: MatchableTrip) => ({ tripId: t.id, title: t.title, start: t.start, end: t.end });

/** Called by the app right after a booking is saved; Part 2's email import calls `matchOne`. */
export async function matchOne(uid: string, kind: Kind, id: string) {
  const ref = db.collection(COLLECTIONS[kind]).doc(id);
  const snap = await ref.get();
  const item = snap.data();
  if (!item || item.ownerUid !== uid) throw new HttpsError('not-found', 'Booking not found');
  if (!(await isPaid(uid))) return { kind: 'none' as const };
  const booking = { ...item, kind } as MatchableBooking;
  if (booking.tripLinkDismissed || booking.tripLink === 'manual') return { kind: 'none' as const };
  const trips = await tripsFor(uid);
  const decision = matchDecision(booking, trips);
  const patch = linkPatchFor(booking, decision);
  if (patch) await ref.update(patch);
  const byId = new Map(trips.map((t) => [t.id, t]));
  if (decision.kind === 'link') return { kind: 'link' as const, trip: summary(byId.get(decision.tripId)!) };
  if (decision.kind === 'ask') return { kind: 'ask' as const, trips: decision.tripIds.map((t) => summary(byId.get(t)!)) };
  return { kind: 'none' as const };
}

export const matchBooking = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const { kind, id } = (request.data ?? {}) as { kind?: unknown; id?: unknown };
  if ((kind !== 'boarding_pass' && kind !== 'reservation') || typeof id !== 'string' || !id) {
    throw new HttpsError('invalid-argument', 'kind and id are required');
  }
  return matchOne(request.auth.uid, kind, id);
});

/**
 * A trip created, re-dated, re-placed, re-membered or deleted can change which
 * bookings belong to it. Everything else (likes, covers, titles) returns at
 * once — trips are written often. Writes bookings only, so it can't loop.
 */
export const onTripWrittenRematch = onDocumentWritten('trips/{tripId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!tripMatchInputsChanged(before, after)) return;
  const tripId = event.params.tripId;

  if (!after) {
    for (const col of Object.values(COLLECTIONS)) {
      const linked = await db.collection(col).where('tripId', '==', tripId).get();
      const batch = db.batch();
      linked.docs.forEach((d) => batch.update(d.ref, { tripId: null, tripLink: null }));
      if (!linked.empty) await batch.commit();
    }
    return;
  }

  const members = new Set<string>([after.authorUid, ...((after.collaborators ?? []) as string[])].filter(Boolean));
  for (const uid of members) {
    if (!(await isPaid(uid))) continue;
    const trips = await tripsFor(uid);
    for (const [kind, col] of Object.entries(COLLECTIONS) as [Kind, string][]) {
      const items = await db.collection(col).where('ownerUid', '==', uid).get();
      const batch = db.batch();
      let writes = 0;
      for (const d of items.docs) {
        const booking = { ...d.data(), kind } as MatchableBooking;
        if (!rematchable(booking, tripId)) continue;
        const patch = linkPatchFor(booking, matchDecision(booking, trips), tripId);
        if (patch) { batch.update(d.ref, patch); writes++; }
      }
      if (writes) await batch.commit();
    }
  }
});
```

- [ ] **Step 4: Export and extend the parser**

`functions/src/index.ts`: add `export { matchBooking, onTripWrittenRematch } from './bookingMatchFunctions';`

`functions/src/parseTravelConfirmation.ts` prompt — in the boarding-pass JSON example add
`"originCountryCode": "US", "destinationCountryCode": "GB", "departureLocalDate": "2026-08-15",`
and in the reservation example add `"city": "Tokyo", "countryCode": "JP",`; add to the rules list:
`- Country codes are ISO 3166-1 alpha-2. "departureLocalDate" is the departure day as printed (local to the departure airport), YYYY-MM-DD.`

`functions/src/types.ts` and `types/ai.ts` (`ParseTravelConfirmationResult`): boarding-pass `fields` gains
`originCountryCode: string; destinationCountryCode: string; departureLocalDate: string;` and reservation `fields` gains
`city: string; countryCode: string;` (both inside the existing `Partial<…>`).

- [ ] **Step 5: Rules and indexes**

In `firestore.rules`, add above `match /boarding_passes/{passId}`:

```
    // Wallet ↔ trip links (bookingMatchFunctions.ts) are Pro. Anyone may clear one.
    function walletLinkKeys() { return ['tripId', 'tripLink', 'tripSuggestions', 'tripLinkDismissed']; }
    function isPaidUser() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('tier', 'free') in ['pro', 'business'];
    }
    function walletLinkWriteAllowed() {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny(walletLinkKeys())
        || isPaidUser()
        || request.resource.data.get('tripId', null) == null;
    }
    function walletCreateLinkAllowed() {
      return request.resource.data.get('tripId', null) == null || isPaidUser();
    }
```

and replace both wallet blocks' rules with:

```
      allow read, delete: if isAuthed() && isOwner(resource.data.ownerUid);
      allow update: if isAuthed() && isOwner(resource.data.ownerUid) && walletLinkWriteAllowed();
      allow create: if isAuthed() && request.auth.uid == request.resource.data.ownerUid && walletCreateLinkAllowed();
```

`firestore.indexes.json` — add to `indexes`:

```json
{ "collectionGroup": "boarding_passes", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "ownerUid", "order": "ASCENDING" }, { "fieldPath": "tripId", "order": "ASCENDING" } ] },
{ "collectionGroup": "reservations", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "ownerUid", "order": "ASCENDING" }, { "fieldPath": "tripId", "order": "ASCENDING" } ] }
```

- [ ] **Step 6: Build, dry-run, test, deploy, commit**

Run: `cd functions && npm run build` → Expected: no errors.
Run: `npx firebase deploy --only firestore:rules --dry-run` → Expected: `Dry run complete!`
Run: `npx jest __tests__/functions/bookingMatch.test.ts` → Expected: PASS.
Run: `npx firebase deploy --only firestore:rules,firestore:indexes,functions:matchBooking,functions:onTripWrittenRematch,functions:parseTravelConfirmation`
Expected: each `✔ … Successful`. (Backward-compatible: older apps never write the link fields, and the parser's new keys are ignored by them.)

```bash
git add functions/src firestore.rules firestore.indexes.json types/ai.ts __tests__/functions/bookingMatch.test.ts
git commit -m "feat: matchBooking callable, trip rematch trigger, parser place fields, wallet link rules"
```

---

### Task 3: Bookings on trip days (pure, client)

**Files:**
- Create: `utils/bookingDays.ts`
- Modify: `types/index.ts` — both `BoardingPass` and `Reservation` gain
  `tripId?: string | null; tripLink?: 'auto' | 'manual' | null; tripSuggestions?: string[]; tripLinkDismissed?: boolean; placeCity?: string; placeCountryCode?: string;`
  and `BoardingPass` also `localDate?: string; originCountryCode?: string; confirmationCode?: string;` (do this first; Task 4 relies on it)
- Test: `__tests__/utils/bookingDays.test.ts`

**Interfaces — Produces:**
```ts
export type TripBooking =
  | { kind: 'boarding_pass'; item: BoardingPass }
  | { kind: 'reservation'; item: Reservation };
export type BookingRole = 'flight' | 'check_in' | 'staying' | 'check_out' | 'booked';
export interface DayBooking { booking: TripBooking; role: BookingRole; time: string | null } // time "HH:MM" local, flights only
export function bookingsByDay(days: { id: string; date: Date | null }[], bookings: TripBooking[]): Record<string, DayBooking[]>;
export function bookingMatchesStop(b: TripBooking, stop: { type: ActivityType; title: string; placeName?: string | null }): boolean;
export function bookingLines(d: DayBooking): { title: string; detail: string };
```

- [ ] **Step 1: Failing tests**

```ts
import { bookingsByDay, bookingMatchesStop, bookingLines, type TripBooking } from '@/utils/bookingDays';
import type { BoardingPass, Reservation } from '@/types';

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const days = [
  { id: 'd1', date: d('2026-07-25') }, { id: 'd2', date: d('2026-07-26') },
  { id: 'd3', date: d('2026-07-27') }, { id: 'd4', date: d('2026-07-28') },
];
const flight: TripBooking = { kind: 'boarding_pass', item: {
  id: 'f', ownerUid: 'me', airline: 'American', flightNumber: 'AA104', origin: 'JFK', originCity: 'New York',
  destination: 'FCO', destinationCity: 'Rome', departureTime: '2026-07-25T08:10:00', seat: '14A',
  status: 'upcoming', createdAt: '', localDate: '2026-07-25', confirmationCode: undefined,
} as unknown as BoardingPass };
const hotel: TripBooking = { kind: 'reservation', item: {
  id: 'h', ownerUid: 'me', type: 'hotel', title: 'Hotel Artemide', confirmationCode: '88213',
  checkIn: '2026-07-25', checkOut: '2026-07-28', createdAt: '',
} as Reservation };

describe('bookingsByDay', () => {
  it('a flight lands on its local day', () => {
    expect(bookingsByDay(days, [flight]).d1).toEqual([{ booking: flight, role: 'flight', time: '08:10' }]);
  });
  it('a hotel: check in, staying each night between, check out', () => {
    const m = bookingsByDay(days, [hotel]);
    expect(m.d1[0].role).toBe('check_in');
    expect(m.d2[0].role).toBe('staying');
    expect(m.d3[0].role).toBe('staying');
    expect(m.d4[0].role).toBe('check_out');
  });
  it('dates outside the trip, and undated days, get nothing', () => {
    const early = { ...hotel, item: { ...hotel.item, checkIn: '2026-07-01', checkOut: '2026-07-02' } } as TripBooking;
    expect(bookingsByDay(days, [early])).toEqual({});
    expect(bookingsByDay([{ id: 'x', date: null }], [hotel])).toEqual({});
  });
  it('a restaurant is booked on its date', () => {
    const dinner = { kind: 'reservation', item: { ...hotel.item, id: 'r', type: 'restaurant', title: 'Luzzi', checkIn: '2026-07-26', checkOut: undefined } } as TripBooking;
    expect(bookingsByDay(days, [dinner]).d2[0].role).toBe('booked');
  });
});

describe('bookingMatchesStop', () => {
  it('the same hotel matches the planned stop', () => {
    expect(bookingMatchesStop(hotel, { type: 'hotel', title: 'Check into Hotel Artemide' })).toBe(true);
    expect(bookingMatchesStop(hotel, { type: 'hotel', title: 'Check in', placeName: 'Hotel Artemide' })).toBe(true);
  });
  it('a different hotel in the same city does not', () => {
    expect(bookingMatchesStop(hotel, { type: 'hotel', title: 'Check into Hotel Quirinale' })).toBe(false);
  });
  it('different kinds never match', () => {
    expect(bookingMatchesStop(hotel, { type: 'restaurant', title: 'Artemide bistro' })).toBe(false);
  });
});

describe('bookingLines', () => {
  it('reads like the trip page', () => {
    expect(bookingLines({ booking: flight, role: 'flight', time: '08:10' }))
      .toEqual({ title: 'AA104 · JFK → FCO · 08:10', detail: 'Seat 14A' });
    expect(bookingLines({ booking: hotel, role: 'check_in', time: null }))
      .toEqual({ title: 'Check in · Hotel Artemide', detail: 'Conf. 88213' });
    expect(bookingLines({ booking: hotel, role: 'staying', time: null }).title).toBe('Staying at Hotel Artemide');
  });
});
```

Run: `npx jest __tests__/utils/bookingDays.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
import type { ActivityType, BoardingPass, Reservation } from '@/types';
import { parseCalendarDate, toCalendarDate } from '@/utils/calendarDate';

export type TripBooking =
  | { kind: 'boarding_pass'; item: BoardingPass }
  | { kind: 'reservation'; item: Reservation };
export type BookingRole = 'flight' | 'check_in' | 'staying' | 'check_out' | 'booked';
export interface DayBooking { booking: TripBooking; role: BookingRole; time: string | null }

const pad = (n: number) => String(n).padStart(2, '0');

/** A flight's day: the date printed on it, else its departure in this device's time (as BoardingPassCard shows it). */
function flightDay(p: BoardingPass): { day: string | null; time: string | null } {
  const t = new Date(p.departureTime);
  const ok = !Number.isNaN(t.getTime());
  return {
    day: p.localDate ?? (ok ? toCalendarDate(t) : null),
    time: ok ? `${pad(t.getHours())}:${pad(t.getMinutes())}` : null,
  };
}

const calendar = (v?: string | null) => {
  const d = v ? parseCalendarDate(v) : null;
  return d ? toCalendarDate(d) : null;
};

export function bookingsByDay(days: { id: string; date: Date | null }[], bookings: TripBooking[]): Record<string, DayBooking[]> {
  const byDate = new Map<string, string>();
  for (const day of days) if (day.date) byDate.set(toCalendarDate(day.date), day.id);
  const out: Record<string, DayBooking[]> = {};
  const put = (date: string | null, entry: DayBooking) => {
    const id = date ? byDate.get(date) : undefined;
    if (id) (out[id] ??= []).push(entry);
  };
  for (const b of bookings) {
    if (b.kind === 'boarding_pass') {
      const { day, time } = flightDay(b.item);
      put(day, { booking: b, role: 'flight', time });
      continue;
    }
    const inDay = calendar(b.item.checkIn);
    const outDay = calendar(b.item.checkOut);
    if (b.item.type !== 'hotel' && b.item.type !== 'airbnb') {
      put(inDay, { booking: b, role: 'booked', time: null });
      continue;
    }
    if (!inDay) continue;
    put(inDay, { booking: b, role: 'check_in', time: null });
    if (!outDay || outDay <= inDay) continue;
    for (const [date] of byDate) {
      if (date > inDay && date < outDay) put(date, { booking: b, role: 'staying', time: null });
    }
    put(outDay, { booking: b, role: 'check_out', time: null });
  }
  return out;
}

const GENERIC = new Set(['the', 'and', 'of', 'at', 'hotel', 'hostel', 'restaurant', 'ristorante', 'cafe', 'bar',
  'check', 'into', 'in', 'dinner', 'lunch', 'breakfast', 'stay', 'inn', 'house']);
const words = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !GENERIC.has(t));

const STOP_TYPE: Partial<Record<Reservation['type'], ActivityType>> = {
  hotel: 'hotel', airbnb: 'hotel', restaurant: 'restaurant', activity: 'activity', show: 'activity',
};

/** The planned stop is this booking's venue: same kind, and every distinctive word of the booking's name is in the stop's. */
export function bookingMatchesStop(b: TripBooking, stop: { type: ActivityType; title: string; placeName?: string | null }): boolean {
  if (b.kind !== 'reservation' || STOP_TYPE[b.item.type] !== stop.type) return false;
  const want = words(b.item.title);
  if (want.length === 0) return false;
  const have = new Set(words(`${stop.title} ${stop.placeName ?? ''}`));
  return want.every((w) => have.has(w));
}

export function bookingLines(d: DayBooking): { title: string; detail: string } {
  const b = d.booking;
  if (b.kind === 'boarding_pass') {
    const p = b.item;
    const route = `${p.flightNumber} · ${p.origin} → ${p.destination}${d.time ? ` · ${d.time}` : ''}`;
    return { title: route, detail: [p.seat ? `Seat ${p.seat}` : null, p.confirmationCode ? `Conf. ${p.confirmationCode}` : null].filter(Boolean).join(' · ') };
  }
  const r = b.item;
  const conf = r.confirmationCode ? `Conf. ${r.confirmationCode}` : '';
  if (d.role === 'check_in') return { title: `Check in · ${r.title}`, detail: conf };
  if (d.role === 'check_out') return { title: `Check out · ${r.title}`, detail: '' };
  if (d.role === 'staying') return { title: `Staying at ${r.title}`, detail: '' };
  return { title: r.title, detail: conf };
}
```


Run: `npx jest __tests__/utils/bookingDays.test.ts` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add utils/bookingDays.ts __tests__/utils/bookingDays.test.ts types/index.ts
git commit -m "feat: place wallet bookings on trip days (pure)"
```

---

### Task 4: Client data, save → match, banner and Undo

**Files:**
- Modify: `hooks/useBoardingPasses.ts`, `hooks/useReservations.ts` (add returns id), `app/(wallet)/boarding-pass/add.tsx`, `app/(wallet)/reservation/add.tsx`, `app/(wallet)/_layout.tsx` (mount banner), `services/gemini.ts` (callable)
- Create: `utils/walletLink.ts`, `hooks/useBookingMatch.ts`, `stores/useBookingBannerStore.ts`, `components/wallet/BookingLinkedBanner.tsx`
- Test: `__tests__/utils/walletLink.test.ts`

**Interfaces:**
- Consumes (Task 2): callable `matchBooking` and its result shape.
- Produces:
  ```ts
  // types/index.ts (added in Task 3) — both BoardingPass and Reservation have:
  tripId?: string | null; tripLink?: 'auto' | 'manual' | null; tripSuggestions?: string[];
  tripLinkDismissed?: boolean; placeCity?: string; placeCountryCode?: string;
  // BoardingPass also: localDate?: string; originCountryCode?: string; confirmationCode?: string;
  // utils/walletLink.ts
  export type MatchResult = { kind: 'link'; trip: TripSummary } | { kind: 'ask'; trips: TripSummary[] } | { kind: 'none' };
  export interface TripSummary { tripId: string; title: string; start: string | null; end: string | null }
  export function linkPatch(action: 'link' | 'unlink' | 'undo' | 'not_for_trip', tripId?: string): Record<string, unknown>;
  export function tripDateEyebrow(start: string | null, end: string | null): string; // "JUL 25 – 30" | "DATES TBD"
  export function draftPlaceFields(draft: ParseTravelConfirmationResult): Record<string, string>;
  // services/gemini.ts
  export async function callMatchBooking(kind: 'boarding_pass' | 'reservation', id: string): Promise<MatchResult>;
  // hooks/useBookingMatch.ts
  export function useBookingMatch(): { afterSave(kind: 'boarding_pass' | 'reservation', id: string): Promise<void> };
  ```

- [ ] **Step 1: Failing tests for `utils/walletLink.ts`**

```ts
import { linkPatch, tripDateEyebrow, draftPlaceFields } from '@/utils/walletLink';

describe('linkPatch', () => {
  it('a manual link clears suggestions and any dismissal', () => {
    expect(linkPatch('link', 'rome')).toEqual({ tripId: 'rome', tripLink: 'manual', tripSuggestions: [], tripLinkDismissed: false });
  });
  it('removing or undoing a link stops automatic matching for this booking', () => {
    expect(linkPatch('unlink')).toEqual({ tripId: null, tripLink: null, tripSuggestions: [], tripLinkDismissed: true });
    expect(linkPatch('undo')).toEqual(linkPatch('unlink'));
  });
  it('"Not for a trip" only dismisses (a free user may write it: tripId stays null)', () => {
    expect(linkPatch('not_for_trip')).toEqual({ tripSuggestions: [], tripLinkDismissed: true });
  });
});

describe('tripDateEyebrow', () => {
  it('formats like the trip eyebrow', () => {
    expect(tripDateEyebrow('2026-07-25', '2026-07-30')).toBe('JUL 25 – 30');
    expect(tripDateEyebrow('2026-07-30', '2026-08-02')).toBe('JUL 30 – AUG 2');
    expect(tripDateEyebrow(null, null)).toBe('DATES TBD');
  });
});

describe('draftPlaceFields', () => {
  it('maps a parsed flight to its place and local day', () => {
    expect(draftPlaceFields({ kind: 'boarding_pass', fields: { destinationCity: 'Rome', destinationCountryCode: 'it',
      originCountryCode: 'us', departureLocalDate: '2026-07-25' } } as never))
      .toEqual({ placeCity: 'Rome', placeCountryCode: 'IT', originCountryCode: 'US', localDate: '2026-07-25' });
  });
  it('maps a parsed reservation, dropping anything malformed', () => {
    expect(draftPlaceFields({ kind: 'reservation', reservationType: 'hotel', fields: { city: 'Roma', countryCode: 'Italy' } } as never))
      .toEqual({ placeCity: 'Roma' });
  });
});
```

Run: `npx jest __tests__/utils/walletLink.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 2: Implement `utils/walletLink.ts`**

```ts
import type { ParseTravelConfirmationResult } from '@/types/ai';
import { parseCalendarDate } from '@/utils/calendarDate';

export interface TripSummary { tripId: string; title: string; start: string | null; end: string | null }
export type MatchResult = { kind: 'link'; trip: TripSummary } | { kind: 'ask'; trips: TripSummary[] } | { kind: 'none' };

export function linkPatch(action: 'link' | 'unlink' | 'undo' | 'not_for_trip', tripId?: string): Record<string, unknown> {
  if (action === 'link') return { tripId: tripId ?? null, tripLink: 'manual', tripSuggestions: [], tripLinkDismissed: false };
  if (action === 'not_for_trip') return { tripSuggestions: [], tripLinkDismissed: true };
  return { tripId: null, tripLink: null, tripSuggestions: [], tripLinkDismissed: true };
}

export function tripDateEyebrow(start: string | null, end: string | null): string {
  const s = start ? parseCalendarDate(start) : null;
  const e = end ? parseCalendarDate(end) : null;
  if (!s || !e) return 'DATES TBD';
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return s.getMonth() === e.getMonth()
    ? `${mon(s)} ${s.getDate()} – ${e.getDate()}`
    : `${mon(s)} ${s.getDate()} – ${mon(e)} ${e.getDate()}`;
}

const ISO2 = /^[A-Za-z]{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The place and day fields a parsed confirmation adds to the saved item (spec: Data). */
export function draftPlaceFields(draft: ParseTravelConfirmationResult): Record<string, string> {
  const out: Record<string, string> = {};
  const f = draft.fields as Record<string, string | undefined>;
  const city = draft.kind === 'boarding_pass' ? f.destinationCity : f.city;
  const country = draft.kind === 'boarding_pass' ? f.destinationCountryCode : f.countryCode;
  if (city?.trim()) out.placeCity = city.trim();
  if (country && ISO2.test(country)) out.placeCountryCode = country.toUpperCase();
  if (draft.kind === 'boarding_pass') {
    if (f.originCountryCode && ISO2.test(f.originCountryCode)) out.originCountryCode = f.originCountryCode.toUpperCase();
    if (f.departureLocalDate && DAY.test(f.departureLocalDate)) out.localDate = f.departureLocalDate;
  }
  return out;
}
```

Run the test → Expected: PASS.

- [ ] **Step 3: Types, hooks return the new id, callable**

(The type fields listed under Interfaces were added in Task 3.)

`hooks/useBoardingPasses.ts` `addPass.mutationFn`:
```ts
    mutationFn: async (pass: Omit<BoardingPass, 'id'>) => {
      const ref = await addDoc(collection(db, 'boarding_passes'), pass);
      return ref.id;
    },
```
Same in `hooks/useReservations.ts` `addReservation` (`return ref.id`).

`services/gemini.ts`:
```ts
export async function callMatchBooking(kind: 'boarding_pass' | 'reservation', id: string): Promise<MatchResult> {
  const fn = httpsCallable<{ kind: string; id: string }, MatchResult>(functions, 'matchBooking');
  return (await fn({ kind, id })).data;
}
```
(import `MatchResult` from `@/utils/walletLink`).

- [ ] **Step 4: Banner store, banner, hook**

`stores/useBookingBannerStore.ts`:
```ts
import { create } from 'zustand';
import type { TripSummary } from '@/utils/walletLink';

interface BookingBanner { kind: 'boarding_pass' | 'reservation'; id: string; trip: TripSummary }
interface State { banner: BookingBanner | null; show: (b: BookingBanner) => void; clear: () => void }

/** "Added to {trip}" after a save. Lives outside the add screen, which closes on save. */
export const useBookingBannerStore = create<State>((set) => ({
  banner: null,
  show: (banner) => set({ banner }),
  clear: () => set({ banner: null }),
}));
```

`hooks/useBookingMatch.ts`:
```ts
import { useCallback } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { callMatchBooking } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBookingBannerStore } from '@/stores/useBookingBannerStore';
import { isPaidTier } from '@/utils/proFeatures';

/** After a booking is saved: Pro → ask the server which trip it belongs to. Never throws; a failed match leaves the booking as saved. */
export function useBookingMatch() {
  const tier = useAuthStore((s) => s.tier);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();
  const show = useBookingBannerStore((s) => s.show);

  const afterSave = useCallback(async (kind: 'boarding_pass' | 'reservation', id: string) => {
    if (!isPaidTier(tier)) return;
    try {
      const result = await callMatchBooking(kind, id);
      queryClient.invalidateQueries({ queryKey: [kind === 'boarding_pass' ? 'boardingPasses' : 'reservations', uid] });
      if (result.kind === 'link') show({ kind, id, trip: result.trip });
      if (result.kind === 'ask') {
        router.push(kind === 'boarding_pass' ? `/(wallet)/boarding-pass/${id}` : `/(wallet)/reservation/${id}`);
      }
    } catch (err) {
      console.warn('[wallet] match failed; the trip trigger or "Add to a trip" covers it', err);
    }
  }, [tier, uid, queryClient, show]);

  return { afterSave };
}
```
(Check the boarding-pass query key in `hooks/useBoardingPasses.ts` and use it exactly.)

`components/wallet/BookingLinkedBanner.tsx` — absolutely positioned at the bottom (above the safe area), surface card with hairline, `Check` icon, text `Added to {trip.title}`, and an **Undo** text button (44pt). Slides in with `Animated.spring(…, SPRING)` from `translateY: 80`; auto-hides after 5 s (`setTimeout`, cleared on unmount/clear). Undo: Medium haptic → `updateDoc(doc(db, kind === 'boarding_pass' ? 'boarding_passes' : 'reservations', id), linkPatch('undo'))` → invalidate the item's query → `clear()`. Colors from `useTheme()`; `accessibilityLiveRegion="polite"` on the text.

Mount it once in `app/(wallet)/_layout.tsx` after the `<Stack />`.

- [ ] **Step 5: Add screens save the new fields and match**

`app/(wallet)/boarding-pass/add.tsx` — in the create branch: spread `...(draftParam === 'true' && draft ? draftPlaceFields(draft) : { placeCity: form.destinationCity.trim() || undefined, localDate: toCalendarDate(departureDate) })` into the new pass (drop undefined keys), and change `onSuccess` to `(newId) => { router.back(); afterSave('boarding_pass', newId); maybePromptForPush(…) }`. (Read the file for the exact form field names — `form.destinationCity`, `departureDate` — and keep them.)

`app/(wallet)/reservation/add.tsx` — create branch: spread `draftPlaceFields(draft)` when from a draft; `onSuccess: (newId) => { router.back(); afterSave('reservation', newId); }`.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit` → Expected: no output.
Run: `npx jest` → Expected: all pass.

```bash
git add utils/walletLink.ts __tests__/utils/walletLink.test.ts hooks stores components/wallet/BookingLinkedBanner.tsx app/\(wallet\) services/gemini.ts
git commit -m "feat: saved bookings ask the server for their trip; Added-to banner with Undo"
```

---

### Task 5: Wallet screens — Trip row, "Is this for a trip?", list eyebrow

**Files:**
- Create: `components/wallet/BookingTripRow.tsx`, `components/wallet/TripSuggestionCard.tsx`, `components/wallet/TripPickerSheet.tsx`, `hooks/useBookingTripLink.ts`, `hooks/useMyTrips.ts`
- Modify: `app/(wallet)/boarding-pass/[id].tsx`, `app/(wallet)/reservation/[id].tsx`, `components/wallet/ReservationCard.tsx`, the boarding-pass list row (`components/wallet/BoardingPassCard.tsx` caller in `app/(wallet)/boarding-passes.tsx`)

**Interfaces:**
- Consumes: `linkPatch`, `tripDateEyebrow`, `TripSummary` (Task 4); `useProGate()`.
- Produces:
  ```ts
  export function useMyTrips(): { trips: TripSummary[]; isLoading: boolean };   // own + collaborator trips, newest first
  export function useBookingTripLink(kind: 'boarding_pass' | 'reservation', id: string):
    { link(tripId: string): void; unlink(): void; notForTrip(): void; pending: boolean };
  ```

- [ ] **Step 1: `useMyTrips`** — two `getDocs` (`trips where authorUid == uid`, `trips where collaborators array-contains uid`), merged by id, mapped to `TripSummary` with `start`/`end` from `toCalendarDate(trip.startDate.toDate())`, sorted by `start` desc (TBD last). Query key `['myTrips', uid]`, `enabled: !!uid`. (Both queries already have indexes: single-field.)

- [ ] **Step 2: `useBookingTripLink`** — `updateDoc` with `linkPatch(...)`, Light haptic on link/unlink, invalidates `['reservations', uid]` / the pass query, `['tripBookings']`.

- [ ] **Step 3: `BookingTripRow`** — props `{ kind, item }`.
  - Linked and the trip is in `useMyTrips()`: eyebrow `{TITLE} · {tripDateEyebrow}` (11pt, tracked, muted), row is a 44pt+ pressable → `router.push('/trip/' + tripId)`; trailing text buttons **Change** (opens `TripPickerSheet`) and **Remove from trip** (`unlink`).
  - Linked but not in `useMyTrips()`: "Trip unavailable" + **Remove**.
  - Unlinked: **Add to a trip** — `isPro ? open picker : openPaywall()`.
- [ ] **Step 4: `TripPickerSheet`** — RN `Modal` pageSheet (`presentationStyle="pageSheet"`), title "Add to a trip", `FlashList` of `useMyTrips()` rows (eyebrow date + title), tap → `link(tripId)` + close. Empty state: icon `MapTrifold`, "No trips yet", "Plan a trip, then add this booking to it.", action "Plan a trip" → `router.push('/trip/new')`.
- [ ] **Step 5: `TripSuggestionCard`** — shown on the detail screen when `item.tripSuggestions?.length && !item.tripId && !item.tripLinkDismissed`. Title "Is this for a trip?", one row per suggested id resolved from `useMyTrips()` (skip unknown ids), each → `link(id)`; last row "Not for a trip" → `notForTrip()`. Card: surface, 16 radius, hairline; spring in.
- [ ] **Step 6: Wire into both detail screens** under the hero: `<TripSuggestionCard …/>` then `<BookingTripRow …/>`. List rows: when `tripId` resolves in `useMyTrips()`, an eyebrow with the trip title above the existing title.
- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npx jest` → Expected: clean, all pass.
Run the supernova-design pre-ship checklist on the four new components and report it.

```bash
git add components/wallet hooks/useBookingTripLink.ts hooks/useMyTrips.ts app/\(wallet\)
git commit -m "feat: wallet Trip row, trip picker, Is-this-for-a-trip card, list eyebrow"
```

---

### Task 6: Trip page — booked rows, booked lines on stops, Bookings chip

**Files:**
- Create: `hooks/useTripBookings.ts`, `components/trip/BookedRow.tsx`, `components/trip/TripBookingsSheet.tsx`
- Modify: `components/trip/DayTimeline.tsx` (new optional props), `components/trip/ActivityItem.tsx` (optional booked line), `app/trip/[id].tsx` (fetch, pass down, chip)

**Interfaces:**
- Consumes: `bookingsByDay`, `bookingMatchesStop`, `bookingLines`, `TripBooking`, `DayBooking` (Task 3).
- Produces:
  ```ts
  export function useTripBookings(tripId: string | null): { bookings: TripBooking[]; isLoading: boolean };
  // DayTimeline new props:
  dayBookings?: DayBooking[];                         // this day's entries from bookingsByDay
  onBookingPress?: (booking: TripBooking) => void;
  ```

- [ ] **Step 1: `useTripBookings`** — query key `['tripBookings', tripId, uid]`; two `getDocs`: `boarding_passes where ownerUid == uid && tripId == tripId`, same for `reservations`; map to `TripBooking`. `enabled: !!tripId && !!uid`. (Owner filter is what keeps bookings private on shared trips.)
- [ ] **Step 2: `BookedRow`** — row matching `ActivityItem`'s height and left inset: `TypeIconBubble`-style bubble using `ACTIVITY_ICONS.flight` for flights and `RESERVATION_ICONS[type]` for reservations (10% tint bubble), `BOOKED` eyebrow, `bookingLines(entry).title` (15pt) and `.detail` (13pt muted). `role === 'staying'` renders the slim variant: one line, 13pt, no bubble. Pressable → `onBookingPress`, `accessibilityLabel` = title + detail.
- [ ] **Step 3: `DayTimeline`** — compute, for each `dayBookings` entry, whether it matches a stop of that day (`bookingMatchesStop`): matched entries pass `bookedDetail = bookingLines(entry).detail || 'Booked'` to that stop's `ActivityItem`; unmatched flights are rendered in time order among stops (compare `entry.time` to `activity.startTime` as `HH:MM` strings — never Dates); `staying` lines render at the top of the day; other unmatched entries render after the stops. Read-only — booked rows are not draggable.
- [ ] **Step 4: `ActivityItem`** — optional `bookedDetail?: string`; when set, a second line `Booked · {bookedDetail}` in 12pt muted with a small `CheckCircle` icon.
- [ ] **Step 5: Trip screen** — `const { bookings } = useTripBookings(trip?.id ?? null)`; `const byDay = useMemo(() => bookingsByDay(sortedDays.map((d) => ({ id: d.id, date: d.date?.toDate() ?? null })), bookings), [...])`; pass `dayBookings={byDay[day.id]}` and `onBookingPress` (→ `router.push` to the wallet detail) to each `DayTimeline`. Add a chip next to Packing, shown only when `bookings.length > 0`: `Ticket` icon + `Bookings · {n}`, Light haptic, opens `TripBookingsSheet`.
- [ ] **Step 6: `TripBookingsSheet`** — pageSheet modal listing all bookings grouped (Flights, Stays, Reservations) as `BookedRow`s; tap opens the wallet detail (close the sheet first).
- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npx jest` → Expected: clean, all pass.
Run the supernova-design pre-ship checklist on `BookedRow`, `TripBookingsSheet` and the chip, and report it.

```bash
git add hooks/useTripBookings.ts components/trip app/trip/\[id\].tsx
git commit -m "feat: bookings on trip days, Booked lines on matching stops, Bookings chip"
```

---

### Task 7: Docs, review, merge

- [ ] CLAUDE.md: add `matchBooking` / `onTripWrittenRematch` / `bookingMatch.ts` to Cloud Functions; the wallet link fields and the Pro rule to Firebase; `useTripBookings`, `useMyTrips`, `useBookingTripLink`, `useBookingMatch` to Hooks; `utils/bookingDays.ts`, `utils/walletLink.ts` to Utils.
- [ ] Final whole-branch review (fresh reviewer, Review Focus above); one fix pass, each fix RED→GREEN.
- [ ] Merge `feat/wallet-trip-matching` into main and push. **No build** — the user will cut 1.0.3 when ready; this ships in it.
