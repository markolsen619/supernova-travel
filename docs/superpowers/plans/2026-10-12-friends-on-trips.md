# Friends on a Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People you follow who are on a trip today appear on the Search globe at that day's city; tapping opens the trip.

**Architecture:** Pure rules on both sides (`functions/src/friendsTraveling.ts`, `utils/friendsTraveling.ts`). The server keeps a per-viewer list `users/{V}/friendsTraveling/{T}` (hourly job + triggers via one `syncTraveler(T)`); the globe reads only that list, filtered to today and for moderation, and draws `FriendTravelMarker`s spread apart per city.

**Tech Stack:** Firebase Functions v2, Firestore rules + collection-group field overrides, Expo/React Native, @rnmapbox/maps `MarkerView`, Jest (pure tests).

**Spec:** `docs/superpowers/specs/2026-10-12-friends-on-trips-design.md`

## Global Constraints

- No GPS, no location permission — position is the itinerary's city for today.
- Only `public`/`followers` trips, not `moderationHidden`; never private. Switch `users/{uid}.settings.showOnGlobe` (missing = on).
- Viewer must follow the traveller; blocks either way exclude; a followers-only trip by someone else (traveller is a collaborator) is shown only to viewers who follow its author.
- Calendar day of a stored date = UTC day of (timestamp + 12 h) — dates are stored at the creator's local midnight.
- `friendsTraveling` read by owner only, written by functions only; deleteAccount removes the user's list and their entries in others'.
- Client shows only entries whose `day` is today (`isCurrentEntry`).
- Design: 40 pt avatar circle, brand ring, first name below; always-dark globe styling; Light haptic on tap; accessibilityLabel "{Name} is in {City} — open their trip".

## Review Focus

1. **Time zones** — a day created at Paris midnight (23:00Z the day before) must still be "today" on its own date. Test `calendarDay` (Task 1).
2. **Trip ended / day missing** — no entry, and the app hides a stale one. Tests `todaysCity` (no day today) and `isCurrentEntry` (Tasks 1, 3).
3. **Collaborator on a followers-only trip** → only viewers following the author. Test `shouldSeeTraveler` (Task 1).
4. **Triggers fire constantly** (trip doc writes) → `travelInputsChanged` gates `syncTraveler`. Test (Task 1).
5. **Several friends in one city** → distinct, deterministic positions. Test `spreadCluster` (Task 3).

---

### Task 1: Server rules (pure)

**Files:** Create `functions/src/friendsTraveling.ts`; Test `__tests__/functions/friendsTraveling.test.ts`

**Produces:** `calendarDay(ms: number): string`; `todayKey(now: Date): string` (= `calendarDay`-independent UTC day of now); `isTripUnderwayToday(trip: TripLike, today: string): boolean`; `todaysCity(trip: TripLike, days: DayLike[], today: string): { city: string; lat: number; lng: number } | null`; `pickTodayTrip<T extends { dayStartMs: number }>(c: T[]): T | null`; `shouldSeeTraveler(p: { viewerFollowsTraveler: boolean; viewerFollowsAuthor: boolean; travelerIsAuthor: boolean; visibility: string; showOnGlobe: boolean | undefined; blocked: boolean }): boolean`; `travelInputsChanged(before: TripLike | null, after: TripLike | null): boolean`; types `TripLike = { visibility?: string; moderationHidden?: boolean; startDateMs?: number | null; endDateMs?: number | null; destination?: Place | null; additionalDestinations?: Place[] | null; collaborators?: string[]; authorUid?: string }`, `Place = { name?: string; lat?: number | null; lng?: number | null }`, `DayLike = { dateMs: number | null; destinationIndex: number | null }`.

- [ ] **Step 1: Failing tests**

```ts
import {
  calendarDay, isTripUnderwayToday, pickTodayTrip, shouldSeeTraveler, todayKey, todaysCity, travelInputsChanged,
} from '../../functions/src/friendsTraveling';

const D = (iso: string) => Date.parse(iso);
const trip = {
  visibility: 'followers', authorUid: 'mark',
  startDateMs: D('2026-11-17T23:00:00Z'), endDateMs: D('2026-12-04T23:00:00Z'), // Paris midnights
  destination: { name: 'Prague', lat: 50.08, lng: 14.43 },
  additionalDestinations: [{ name: 'Budapest', lat: 47.5, lng: 19.04 }, { name: 'Vienna', lat: null, lng: null }],
};

describe('calendarDay', () => {
  it('reads a date stored at local midnight as that local date, east or west of UTC', () => {
    expect(calendarDay(D('2026-11-17T23:00:00Z'))).toBe('2026-11-18'); // Paris midnight
    expect(calendarDay(D('2026-11-18T08:00:00Z'))).toBe('2026-11-18'); // Los Angeles midnight
  });
  it('todayKey is the UTC day of now', () => expect(todayKey(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-20'));
});

describe('isTripUnderwayToday', () => {
  it('is true from the first day to the last, for shared trips only', () => {
    expect(isTripUnderwayToday(trip, '2026-11-18')).toBe(true);
    expect(isTripUnderwayToday(trip, '2026-12-05')).toBe(true);
    expect(isTripUnderwayToday(trip, '2026-12-06')).toBe(false);
    expect(isTripUnderwayToday(trip, '2026-11-17')).toBe(false);
  });
  it('never for a private, hidden or undated trip', () => {
    expect(isTripUnderwayToday({ ...trip, visibility: 'private' }, '2026-11-20')).toBe(false);
    expect(isTripUnderwayToday({ ...trip, moderationHidden: true }, '2026-11-20')).toBe(false);
    expect(isTripUnderwayToday({ ...trip, startDateMs: null }, '2026-11-20')).toBe(false);
  });
});

describe('todaysCity', () => {
  const days = [
    { dateMs: D('2026-11-17T23:00:00Z'), destinationIndex: 0 },
    { dateMs: D('2026-11-21T23:00:00Z'), destinationIndex: 1 },
    { dateMs: D('2026-11-25T23:00:00Z'), destinationIndex: 2 },
    { dateMs: D('2026-11-26T23:00:00Z'), destinationIndex: null },
  ];
  it("is the city of the day dated today", () => {
    expect(todaysCity(trip, days, '2026-11-22')).toEqual({ city: 'Budapest', lat: 47.5, lng: 19.04 });
    expect(todaysCity(trip, days, '2026-11-27')).toEqual({ city: 'Prague', lat: 50.08, lng: 14.43 }); // null → first
  });
  it('is nothing without a day today or without coordinates', () => {
    expect(todaysCity(trip, days, '2026-11-20')).toBeNull();
    expect(todaysCity(trip, days, '2026-11-26')).toBeNull(); // Vienna has no coordinates
  });
});

describe('pickTodayTrip', () => {
  it('takes the trip whose current day started latest', () => {
    expect(pickTodayTrip([{ id: 'a', dayStartMs: 1 }, { id: 'b', dayStartMs: 5 }])?.id).toBe('b');
    expect(pickTodayTrip([])).toBeNull();
  });
});

describe('shouldSeeTraveler', () => {
  const base = { viewerFollowsTraveler: true, viewerFollowsAuthor: true, travelerIsAuthor: true, visibility: 'followers', showOnGlobe: undefined, blocked: false };
  it('shows followers, with the switch on by default', () => expect(shouldSeeTraveler(base)).toBe(true));
  it('respects the switch, follows and blocks', () => {
    expect(shouldSeeTraveler({ ...base, showOnGlobe: false })).toBe(false);
    expect(shouldSeeTraveler({ ...base, viewerFollowsTraveler: false })).toBe(false);
    expect(shouldSeeTraveler({ ...base, blocked: true })).toBe(false);
  });
  it("shows a collaborator's followers-only trip only to people who can open it", () => {
    expect(shouldSeeTraveler({ ...base, travelerIsAuthor: false, viewerFollowsAuthor: false })).toBe(false);
    expect(shouldSeeTraveler({ ...base, travelerIsAuthor: false, viewerFollowsAuthor: true })).toBe(true);
    expect(shouldSeeTraveler({ ...base, travelerIsAuthor: false, viewerFollowsAuthor: false, visibility: 'public' })).toBe(true);
  });
});

describe('travelInputsChanged', () => {
  it('ignores writes that change nothing the globe uses', () => {
    expect(travelInputsChanged(trip, { ...trip })).toBe(false);
  });
  it('reacts to dates, cities, visibility, hiding, collaborators, creation and deletion', () => {
    expect(travelInputsChanged(trip, { ...trip, visibility: 'private' })).toBe(true);
    expect(travelInputsChanged(trip, { ...trip, endDateMs: 1 })).toBe(true);
    expect(travelInputsChanged(trip, { ...trip, collaborators: ['kell'] })).toBe(true);
    expect(travelInputsChanged(null, trip)).toBe(true);
    expect(travelInputsChanged(trip, null)).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx jest __tests__/functions/friendsTraveling.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `functions/src/friendsTraveling.ts`:

```ts
/** Friends on a trip, on the globe (docs/superpowers/specs/2026-10-12-friends-on-trips-design.md). Pure. */
export type Place = { name?: string; lat?: number | null; lng?: number | null };
export type TripLike = {
  visibility?: string; moderationHidden?: boolean; startDateMs?: number | null; endDateMs?: number | null;
  destination?: Place | null; additionalDestinations?: Place[] | null; collaborators?: string[]; authorUid?: string;
};
export type DayLike = { dateMs: number | null; destinationIndex: number | null };

const HALF_DAY = 12 * 3_600_000;
/** Dates are stored at the creator's local midnight; reading at noon gives that calendar day anywhere. */
export function calendarDay(ms: number): string {
  return new Date(ms + HALF_DAY).toISOString().slice(0, 10);
}
export function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
const SHARED = new Set(['public', 'followers']);

export function isTripUnderwayToday(trip: TripLike, today: string): boolean {
  if (!SHARED.has(trip.visibility ?? '') || trip.moderationHidden) return false;
  if (trip.startDateMs == null || trip.endDateMs == null) return false;
  return calendarDay(trip.startDateMs) <= today && today <= calendarDay(trip.endDateMs);
}

export function todaysCity(trip: TripLike, days: DayLike[], today: string): { city: string; lat: number; lng: number } | null {
  const day = days.find((d) => d.dateMs != null && calendarDay(d.dateMs) === today);
  if (!day) return null;
  const places = [trip.destination ?? null, ...(trip.additionalDestinations ?? [])];
  const p = places[day.destinationIndex ?? 0] ?? places[0];
  if (!p || p.lat == null || p.lng == null || !p.name) return null;
  return { city: p.name, lat: p.lat, lng: p.lng };
}

export function pickTodayTrip<T extends { dayStartMs: number }>(candidates: T[]): T | null {
  return candidates.reduce<T | null>((best, c) => (!best || c.dayStartMs > best.dayStartMs ? c : best), null);
}

export function shouldSeeTraveler(p: {
  viewerFollowsTraveler: boolean; viewerFollowsAuthor: boolean; travelerIsAuthor: boolean;
  visibility: string; showOnGlobe: boolean | undefined; blocked: boolean;
}): boolean {
  if (p.showOnGlobe === false || p.blocked || !p.viewerFollowsTraveler) return false;
  // A collaborator on a followers-only trip: only viewers who can open it (they follow its author).
  if (!p.travelerIsAuthor && p.visibility === 'followers' && !p.viewerFollowsAuthor) return false;
  return true;
}

const pick = (t: TripLike | null) => t && JSON.stringify([
  t.visibility, !!t.moderationHidden, t.startDateMs ?? null, t.endDateMs ?? null,
  t.destination ?? null, t.additionalDestinations ?? null, [...(t.collaborators ?? [])].sort(), t.authorUid ?? null,
]);
/** Trips are written constantly; only these fields move a friend on the globe. */
export function travelInputsChanged(before: TripLike | null, after: TripLike | null): boolean {
  return pick(before) !== pick(after);
}
```

- [ ] **Step 4:** run the test → PASS; `cd functions && npm run build` → no errors.
- [ ] **Step 5: Commit** `feat(friends-globe): pure rules — calendar days, today's city, who sees whom`.

---

### Task 2: Server sync, triggers, rules, indexes, account deletion

**Files:** Create `functions/src/friendsTravelingFunctions.ts`; Modify `functions/src/index.ts`, `firestore.rules`, `firestore.indexes.json`, `functions/src/deleteAccount.ts`

**Consumes:** Task 1. **Produces:** `syncTraveler(uid: string, now?: Date): Promise<number>` (entries written); functions `refreshFriendsTraveling`, `onTripWrittenFriends`, `onTripDayWrittenFriends`, `onFollowWrittenFriends`, `onUserWrittenFriends`, `onBlockCreatedFriends`. Entry doc `users/{V}/friendsTraveling/{T}` = `{ uid, name, avatarUrl, tripId, tripTitle, city, lat, lng, day, updatedAt }`.

- [ ] **Step 1: `syncTraveler(T)`** —
  1. `user = users/{T}`; if missing → delete all T's entries (step 6) and return 0.
  2. Trips: `trips where authorUid == T` and `trips where collaborators array-contains T`, both with `endDate >= now − 2 days` (Timestamp) — then in code `isTripUnderwayToday` with `startDateMs`/`endDateMs` from `toMillis()`.
  3. For each, read its `days` (all; small), map to `DayLike`, `todaysCity`; keep `{ tripId, title, visibility, authorUid, city, lat, lng, dayStartMs }` where city non-null; `pickTodayTrip`.
  4. If none, or `user.settings?.showOnGlobe === false` → delete T's entries, return 0.
  5. Followers: `follows where followeeUid == T` → viewers. Blocks: `users/{T}/blocked` ids; for each viewer `users/{V}/blocked/{T}` exists (`getAll`). If the trip's author ≠ T and visibility is `followers`: `follows/{V}_{author}` exists (`getAll`). Keep viewers passing `shouldSeeTraveler`.
  6. Batch (≤ 450 per commit): set `users/{V}/friendsTraveling/{T}` for kept viewers with `day: todayKey(now)`, name = `fullName || username`, avatarUrl; delete entries from `collectionGroup('friendsTraveling').where('uid', '==', T)` whose parent viewer isn't kept.
- [ ] **Step 2: Triggers**, each calling `syncTraveler` for the affected people (dedupe):
  - `onTripWrittenFriends` (`trips/{id}`): if `travelInputsChanged(before, after)` → author + collaborators of before ∪ after.
  - `onTripDayWrittenFriends` (`trips/{id}/days/{dayId}`): if `date` or `destinationIndex` changed → read the trip, sync author + collaborators when `isTripUnderwayToday` (today or any change).
  - `onFollowWrittenFriends` (`follows/{id}`): sync the followee (before or after doc's `followeeUid`).
  - `onUserWrittenFriends` (`users/{uid}`): if `settings.showOnGlobe`, `fullName`, `username` or `avatarUrl` changed → sync uid.
  - `onBlockCreatedFriends` (`users/{uid}/blocked/{b}`): sync uid and b.
- [ ] **Step 3: `refreshFriendsTraveling`** (every 60 minutes): trips with `endDate >= now − 2 days` and visibility in (`public`,`followers`) → distinct authors + collaborators whose trip `isTripUnderwayToday` → `syncTraveler` each (8 at a time); then `collectionGroup('friendsTraveling').where('day', '<', todayKey(now))` → for each distinct `uid`, `syncTraveler` (removes ended trips).
- [ ] **Step 4: Rules** — inside `match /users/{uid}`:

```
      // Friends on a trip (functions/src/friendsTravelingFunctions.ts): your own list, server-written.
      match /friendsTraveling/{travelerUid} {
        allow read: if isOwner(uid);
        allow write: if false;
      }
```

- [ ] **Step 5: Indexes** — `firestore.indexes.json` `fieldOverrides`: `friendsTraveling.uid` and `friendsTraveling.day`, each `{ "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }` (plus the default collection scope).
- [ ] **Step 6: deleteAccount** — before the `users/{uid}` recursive delete: `collectionGroup('friendsTraveling').where('uid', '==', uid)` → delete each (their own list goes with the recursive delete).
- [ ] **Step 7:** export all from `functions/src/index.ts`; `cd functions && npm run build`; `npx jest __tests__/functions`; deploy `firestore:rules,firestore:indexes,functions:<the six>,functions:deleteAccount`.
- [ ] **Step 8: Commit** `feat(friends-globe): per-viewer lists kept by an hourly job and triggers; rules, indexes, account deletion`.

---

### Task 3: App — list, markers, settings, docs

**Files:** Create `utils/friendsTraveling.ts`, `__tests__/utils/friendsTraveling.test.ts`, `hooks/useFriendsTraveling.ts`, `components/search/FriendTravelMarker.tsx`; Modify `components/search/GlobeMapView.tsx` (+ its caller `app/(tabs)/search.tsx` for navigation), `app/settings/privacy.tsx`, `hosting/privacy.html`, `CLAUDE.md`

**Produces:** `isCurrentEntry(e: { day?: string | null }, now: Date): boolean`; `spreadCluster<T extends { uid: string; lat: number; lng: number }>(entries: T[], zoom: number): (T & { lat: number; lng: number })[]`.

- [ ] **Step 1: Failing tests**

```ts
import { isCurrentEntry, spreadCluster } from '@/utils/friendsTraveling';

describe('isCurrentEntry', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  it('keeps only today', () => {
    expect(isCurrentEntry({ day: '2026-11-22' }, now)).toBe(true);
    expect(isCurrentEntry({ day: '2026-11-21' }, now)).toBe(false);
    expect(isCurrentEntry({}, now)).toBe(false);
  });
});

describe('spreadCluster', () => {
  const a = { uid: 'a', lat: 50, lng: 14 };
  it('leaves a lone traveller exactly on the city', () => {
    expect(spreadCluster([a], 4)).toEqual([a]);
  });
  it('spreads travellers in one city to distinct, stable spots', () => {
    const b = { uid: 'b', lat: 50, lng: 14 };
    const out = spreadCluster([b, a], 4);
    expect(new Set(out.map((o) => `${o.lat},${o.lng}`)).size).toBe(2);
    expect(spreadCluster([a, b], 4)).toEqual(spreadCluster([b, a], 4).sort((x, y) => x.uid.localeCompare(y.uid)));
  });
  it('spreads less as the map zooms in', () => {
    const b = { uid: 'b', lat: 50, lng: 14 };
    const far = spreadCluster([a, b], 3).find((o) => o.uid === 'a')!;
    const near = spreadCluster([a, b], 10).find((o) => o.uid === 'a')!;
    expect(Math.abs(near.lng - 14)).toBeLessThan(Math.abs(far.lng - 14));
  });
});
```

- [ ] **Step 2:** run → FAIL. **Step 3: Implement** `utils/friendsTraveling.ts`:

```ts
/** Friends on a trip, client rules (docs/superpowers/specs/2026-10-12-friends-on-trips-design.md). */
export function isCurrentEntry(e: { day?: string | null }, now: Date): boolean {
  return !!e.day && e.day === now.toISOString().slice(0, 10);
}

const SPREAD_PX = 26;
/** Several friends in one city sit on a small ring around it (sorted by uid, so stable); one stays put. */
export function spreadCluster<T extends { uid: string; lat: number; lng: number }>(entries: T[], zoom: number): T[] {
  const groups = new Map<string, T[]>();
  for (const e of [...entries].sort((x, y) => x.uid.localeCompare(y.uid))) {
    const k = `${e.lat.toFixed(3)},${e.lng.toFixed(3)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: T[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    // Degrees per pixel at this zoom (Web Mercator, 512 px tiles).
    const degPerPx = 360 / (512 * 2 ** zoom);
    const r = SPREAD_PX * degPerPx;
    g.forEach((e, i) => {
      const a = (2 * Math.PI * i) / g.length;
      out.push({ ...e, lat: e.lat + r * Math.sin(a), lng: e.lng + (r * Math.cos(a)) / Math.cos((e.lat * Math.PI) / 180) });
    });
  }
  return out;
}
```

Run → PASS.
- [ ] **Step 4: Hook** `hooks/useFriendsTraveling.ts`: `useQuery(['friendsTraveling', uid])` → `getDocs(collection(db, 'users', uid, 'friendsTraveling'))`, staleTime + `refetchInterval` 10 min; then `filterVisible(…, moderation, (e) => ({ authorUid: e.uid }))` and `isCurrentEntry(e, new Date())`.
- [ ] **Step 5: Marker** `FriendTravelMarker` (`{ entry, onPress }`): 40 pt circle, `Avatar` (or initials), 2 pt ring in `DarkColors.brand.purple`, first name below in `DarkColors.text.primary` 11 pt medium; `TouchableOpacity` with the spec's accessibilityLabel; Light haptic.
- [ ] **Step 6: Globe** — in `GlobeMapView` accept `friends` + `zoom` + `onFriendPress` props, render `spreadCluster(friends, zoom).map((f) => <MarkerView key={f.uid} coordinate={[f.lng, f.lat]} allowOverlap>…)`; `app/(tabs)/search.tsx` passes `useFriendsTraveling()`, the current zoom (already tracked for pins, or from `onCameraChanged`), and `onFriendPress = (f) => router.push(\`/trip/${f.tripId}\`)`.
- [ ] **Step 7: Settings** — `app/settings/privacy.tsx`: a `SettingsRow` "Show me on friends' globes" with `Switch` (value `profile?.settings?.showOnGlobe !== false`), `updateDoc(users/{uid}, { 'settings.showOnGlobe': next })`, Medium haptic, optimistic with revert on failure, and the spec's footnote text beneath.
- [ ] **Step 8: Privacy policy** sentence (spec) in `hosting/privacy.html`; `firebase deploy --only hosting`.
- [ ] **Step 9: CLAUDE.md** — Cloud Functions bullet **Friends on a trip** (lists, triggers, rules, calendar-day rule, collaborator rule, deletion) and the hook/marker lines.
- [ ] **Step 10: Verify & commit** — `npx jest --silent && npx tsc --noEmit -p . && npm run lint` (0 errors); `npx expo export --platform ios` bundles; commit `feat(friends-globe): travelling friends on the globe, Settings switch, policy, docs`.
