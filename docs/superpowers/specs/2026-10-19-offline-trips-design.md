# Offline trips and boarding passes — design

Date: 2026-10-19 · Status: approved in conversation, awaiting spec review · Ships in 1.0.8 (new native module)

## Why

Competitors are trusted partly because a boarding pass and the day's plan open at the gate, abroad or on the metro with no signal. Supernova shows nothing offline: Firestore runs in its web build (memory cache only) and TanStack Query keeps data in memory, so a cold start without signal has no data. Worse, the auth listener's `hydrateSession` reads `users/{uid}`; offline that read fails and the app routes to `/(auth)/welcome`, so the user appears signed out.

## Decisions (owner, 2026-10-19)

- **Scope:** trip itineraries and the wallet (boarding passes with barcode, reservations). Not photos, not maps.
- **View only offline.** No queued edits.
- **Approach A:** persist an allow-listed slice of the TanStack Query cache to device storage; prefetch trip details while online. (Rejected: a separate per-trip snapshot store — a second data path for every screen; migrating to the native Firebase SDK — far too large.)
- **Which trips:** the user's own and joined trips, automatically (no "download" button).

## 1. What is kept on the phone

Persisted query keys (allow-list; everything else stays memory-only):

| Key | Data |
|---|---|
| `['trips', uid]` | own trip list |
| `['myTrips', uid]` | own + collaborator trips (`TripSummary`) |
| `['trip', tripId]` | trip with days and activities (`TripWithDays`) |
| `['tripBookings', tripId, uid]` | bookings on the trip, incl. members' shared copies |
| `['packingItems', tripId]` | packing list |
| `['boardingPasses', uid]` | wallet passes (barcode data included — the QR is drawn on the phone) |
| `['reservations', uid]` | wallet reservations |
| `['sharedTripBookings', uid, *]` | wallet "By trip" shared bookings |

- Only successful queries are saved. Pass and reservation detail screens read from the list queries, so they work without extra keys.
- **Trip set and cap:** at most 40 trips' details — in progress first, then upcoming (soonest first), then past (most recent first). Detail entries for other trips are not persisted. Expected size ≈ 1 MB.
- **Prefetch while online:** after the trip list loads, fetch `['trip', id]` (and its bookings and packing) for trips in the set whose saved copy is missing or older than 12 h, one at a time, after the first screen has rendered. Cost is bounded: a trip already fresh is skipped.
- **Timestamps:** Firestore `Timestamp` serialises to `{seconds, nanoseconds, type: 'firestore/timestamp/1.x'}` via its `toJSON`; on restore those objects are revived into `Timestamp` instances (`reviveTimestamps`, pure, deep), so `toDate()`, status badges and date ranges work.
- **Expiry:** the saved cache is dropped after 30 days, when its schema/app-version buster changes, or when its stored uid differs from the signed-in uid.

## 2. Starting the app offline

- After every successful `hydrateSession`, save a **session snapshot** (`sessionSnapshot:{uid}`): profile fields used by `useUserStore`, server `tier`, `hasSeenOnboarding`, `aiConsentVersion`, and the moderation lists (blocked uids, hidden keys).
- If `hydrateSession`'s profile read fails **and** the device is offline **and** a snapshot exists for this uid, hydrate the stores from the snapshot and route as if signed in (to the tabs). Otherwise keep today's behaviour.
- When connectivity returns, run the full `hydrateSession` once more (refreshes tier, profile, moderation) without re-routing.

## 3. What the user sees offline

- **Online detection:** `@react-native-community/netinfo` drives TanStack's `onlineManager`. While offline, queries pause and show cached data instead of erroring or spinning; they refetch on reconnect.
- **Offline strip:** a slim bar at the top — "You're offline · Showing your saved trips" — with the house motion (spring 65/11) in and out. Theme tokens; both themes.
- **Uncached screens** (feed, explore, search, other profiles, notifications, messages) show an empty state: icon + title + description, e.g. "Connect to see the feed" — never an endless spinner.
- **View only:** these entry points refuse with a short "You're offline — try again when you're connected" message (Light haptic), checked through one helper (`requireOnline()`):
  edit trip, add/edit/move/delete stop, route changes, Ask Nova, add/edit/delete wallet items, link/unlink bookings, packing changes, budget/expenses, posting, commenting, following, messaging.
  Reason: with the web SDK's memory cache an offline write waits in memory and is lost if the app closes.

## 4. Privacy and storage

- Stored in the app's private storage (AsyncStorage), key namespaced by uid.
- **Wiped** on sign-out (`app/settings`), account deletion (`services/account.ts`) and when a different uid signs in; the in-memory query cache is cleared too.
- Nothing new leaves the device, so App Privacy / Play Data safety are unchanged. Privacy policy: add one sentence that trips and wallet items are kept on the device for offline use and removed on sign-out.

## Units

| Unit | Kind | Responsibility |
|---|---|---|
| `utils/offlineCache.ts` | pure | `shouldPersistQuery(key, status)`, `reviveTimestamps(value)`, `offlineTripSet(trips, now, cap=40)`, `needsPrefetch(savedAt, now)`, `cacheBelongsTo(stored, uid)` |
| `utils/sessionSnapshot.ts` | pure | build/parse the snapshot; `canUseSnapshot({ readFailed, offline, snapshotUid, uid })` |
| `services/offline.ts` | wiring | NetInfo → `onlineManager`; `isOnline()`; `requireOnline(onBlocked)` |
| `services/queryPersist.ts` | wiring | AsyncStorage persister (throttled), restore with revive, clear on sign-out |
| `hooks/useOfflinePrefetch.ts` | wiring | background prefetch of the trip set |
| `components/ui/OfflineBanner.tsx` | UI | the strip |
| `app/_layout.tsx`, `services/session.ts`, `services/account.ts`, `app/settings` | edits | provider, snapshot save/restore, wipes |

## Testing

- Unit tests for every pure function above: allow-list (each key in, a feed/profile key out, errored queries out); Timestamp revival (nested in arrays/objects, untouched lookalikes without the type marker); trip-set ordering and cap; prefetch freshness; snapshot round trip and the `canUseSnapshot` truth table; uid mismatch drops the cache.
- Device check on the 1.0.8 TestFlight build: airplane mode → force-quit → open: tabs (not welcome), offline strip, trips list, a trip's days, a boarding pass with a scannable QR, a reservation; tap Edit and Ask Nova → offline message; turn signal on → strip leaves, data refreshes. Sign out → airplane mode → open → nothing of the previous account visible.

## Out of scope

Offline photos and maps; offline edits; offline Explore/feed; encrypting the cache beyond the OS sandbox.
