// utils/offlineCache.ts
/**
 * Offline trips and wallet (spec docs/superpowers/specs/2026-10-19-offline-trips-design.md): which cached
 * queries are kept on the phone, how their Firestore Timestamps come back from JSON, which trips are worth
 * keeping, and when a saved copy is stale. Pure.
 */
import { Timestamp } from 'firebase/firestore';

export const OFFLINE_MAX_AGE_MS = 30 * 24 * 3600_000;
export const PREFETCH_FRESH_MS = 12 * 3600_000;
export const OFFLINE_TRIP_CAP = 40;

/** Per-user lists (key length 2: [root, uid]) and trip details (filtered by the offline trip set). */
const USER_LISTS = new Set(['trips', 'myTrips', 'boardingPasses', 'reservations']);
const TRIP_DETAILS = new Set(['trip', 'tripBookings', 'packingItems']);
export const PERSISTED_ROOTS = [...USER_LISTS, ...TRIP_DETAILS, 'sharedTripBookings'] as const;

/** The profile Trips tab lists that are the user's own ('withJoined' on the tab, 'all' via their own profile). */
const OWN_TRIP_SCOPES = new Set(['withJoined', 'all']);

/**
 * Kept when the query has data (a refresh that failed on weak signal keeps its last good copy) and belongs to
 * `uid` — another account's list is never written under this account's cache.
 */
export function shouldPersistQuery(queryKey: readonly unknown[], hasData: boolean, allowedTripIds: ReadonlySet<string>, uid: string): boolean {
  if (!hasData) return false;
  const [root, second, third] = queryKey;
  if (typeof root !== 'string') return false;
  if (USER_LISTS.has(root)) {
    if (second !== uid) return false;
    if (queryKey.length === 2) return true;
    // ['trips', uid, 'public' | 'followers'] is how others see a profile; only the owner's scopes are kept.
    return root === 'trips' && queryKey.length === 3 && OWN_TRIP_SCOPES.has(third as string);
  }
  if (root === 'sharedTripBookings') return second === uid;
  if (root === 'tripBookings') return typeof second === 'string' && allowedTripIds.has(second) && third === uid;
  if (TRIP_DETAILS.has(root)) return typeof second === 'string' && allowedTripIds.has(second);
  return false;
}

/**
 * Whether a failed profile read at launch means "no signal" (open from the saved session) rather than a real
 * server error (keep today's welcome). Captive or plane Wi-Fi reports connected but unreachable; Firestore
 * reports `unavailable` when it can't reach its backend.
 */
export function looksOffline(
  net: { isConnected: boolean | null; isInternetReachable: boolean | null },
  error: unknown,
): boolean {
  if (net.isConnected === false || net.isInternetReachable === false) return true;
  return (error as { code?: unknown } | null)?.code === 'unavailable';
}

/** Timestamp.toJSON() writes {type: 'firestore/timestamp/1.0', seconds, nanoseconds}; only that marker is revived. */
const TS_TYPE_PREFIX = 'firestore/timestamp/';
export function reviveTimestamps<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => reviveTimestamps(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.type === 'string' && o.type.startsWith(TS_TYPE_PREFIX) && typeof o.seconds === 'number' && typeof o.nanoseconds === 'number') {
      return new Timestamp(o.seconds, o.nanoseconds) as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = reviveTimestamps(v);
    return out as T;
  }
  return value;
}

type DatedTrip = { id: string; startDate: Timestamp | null; endDate: Timestamp | null };

/** In progress → upcoming (soonest) → no dates → past (most recent), capped. */
export function offlineTripSet(trips: DatedTrip[], now: Date, cap = OFFLINE_TRIP_CAP): string[] {
  const t = now.getTime();
  const rank = (trip: DatedTrip): [number, number] => {
    const start = trip.startDate?.toMillis?.() ?? null;
    const end = trip.endDate?.toMillis?.() ?? start;
    if (start == null) return [2, 0];
    // A trip runs through the whole of its last day.
    if (start <= t && (end ?? start) + 24 * 3600_000 > t) return [0, start];
    if (start > t) return [1, start];
    return [3, -(end ?? start)];
  };
  return [...trips]
    .map((trip) => ({ id: trip.id, r: rank(trip) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1])
    .slice(0, cap)
    .map((x) => x.id);
}

export function needsPrefetch(dataUpdatedAt: number | undefined, now: number): boolean {
  return !dataUpdatedAt || now - dataUpdatedAt > PREFETCH_FRESH_MS;
}

export function cacheBuster(uid: string): string {
  return `offline-v1:${uid}`;
}

export function cacheBelongsTo(buster: string | undefined, uid: string): boolean {
  return buster === cacheBuster(uid);
}

/** A calendar day ("2026-11-01") read at noon UTC, so no timezone moves it to a neighbouring day. */
function dayToTimestamp(day: string | null): Timestamp | null {
  if (!day) return null;
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

/**
 * Own trips (['trips', uid], Firestore timestamps) and joined trips (['myTrips', uid], calendar-day summaries)
 * as one list for offlineTripSet. An own trip's real timestamps win over its summary.
 */
export function tripsForOffline(
  own: DatedTrip[],
  joined: { tripId: string; start: string | null; end: string | null }[],
): DatedTrip[] {
  const byId = new Map<string, DatedTrip>();
  for (const s of joined) byId.set(s.tripId, { id: s.tripId, startDate: dayToTimestamp(s.start), endDate: dayToTimestamp(s.end) });
  for (const t of own) byId.set(t.id, t);
  return [...byId.values()];
}

/**
 * The persister writes up to 2 s late (throttled), with the client it dehydrated earlier. Refusing any write
 * whose buster isn't the signed-in account's stops a sign-out or account switch from being undone by it.
 */
export function serializeIfCurrent<T extends { buster?: string }>(data: T, activeBuster: string | null): string {
  if (!activeBuster || data.buster !== activeBuster) throw new Error('offline cache: stale write dropped');
  return JSON.stringify(data);
}
