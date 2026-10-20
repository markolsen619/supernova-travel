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

export function shouldPersistQuery(queryKey: readonly unknown[], status: string, allowedTripIds: ReadonlySet<string>): boolean {
  if (status !== 'success') return false;
  const [root, second] = queryKey;
  if (typeof root !== 'string') return false;
  // ['trips', uid, 'public'] is someone's profile tab, not the user's own list.
  if (USER_LISTS.has(root)) return queryKey.length === 2;
  if (root === 'sharedTripBookings') return true;
  if (TRIP_DETAILS.has(root)) return typeof second === 'string' && allowedTripIds.has(second);
  return false;
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
