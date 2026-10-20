/**
 * Keeps the offline slice of the query cache on the phone, one account at a time (spec §1, §4). The buster
 * is per uid, so another account's saved copy is discarded on restore; sign-out wipes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Timestamp } from 'firebase/firestore';
import {
  cacheBuster, offlineTripSet, OFFLINE_MAX_AGE_MS, PERSISTED_ROOTS, reviveTimestamps, serializeIfCurrent,
  shouldPersistQuery, tripsForOffline,
} from '@/utils/offlineCache';

/** The account whose cache may be written; null after sign-out. Checked at write time (writes are late). */
let activeBuster: string | null = null;
/** Bumped on every start/stop, so a restore that finishes after a sign-out is undone. */
let generation = 0;
let lastUid: string | null = null;
let unsubscribe: (() => void) | null = null;

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'offline-query-cache',
  throttleTime: 2000,
  // Throws for a stale write; the persister catches it and drops the write.
  serialize: (data) => serializeIfCurrent(data, activeBuster),
  deserialize: (raw) => reviveTimestamps(JSON.parse(raw)),
});

type DatedTrip = { id: string; startDate: Timestamp | null; endDate: Timestamp | null };

/** The user's own + joined trips, from whichever lists are loaded. */
export function knownTrips(queryClient: QueryClient, uid: string): DatedTrip[] {
  const own = queryClient.getQueryData<DatedTrip[]>(['trips', uid, 'withJoined'])
    ?? queryClient.getQueryData<DatedTrip[]>(['trips', uid])
    ?? [];
  const joined = queryClient.getQueryData<{ tripId: string; start: string | null; end: string | null }[]>(['myTrips', uid]) ?? [];
  return tripsForOffline(own, joined);
}

/**
 * Saved queries must outlive TanStack's default 5-minute gcTime: a collected query fires a cache event, the next
 * save no longer includes it, and the trip is gone from the phone (and re-fetched on every launch).
 */
export function keepOfflineQueriesAlive(queryClient: QueryClient): void {
  for (const root of PERSISTED_ROOTS) queryClient.setQueryDefaults([root], { gcTime: OFFLINE_MAX_AGE_MS });
}

export async function startPersistence(queryClient: QueryClient, uid: string): Promise<void> {
  unsubscribe?.();
  // A different account signing in (even without a sign-out in between) never sees the last one's data.
  if (lastUid !== null && lastUid !== uid) queryClient.clear();
  lastUid = uid;
  activeBuster = cacheBuster(uid);
  const myGeneration = ++generation;

  // The offline trip set, computed once per save rather than once per query.
  let allowed: ReadonlySet<string> = new Set();
  let allowedFor = '';
  const allowedTrips = () => {
    const trips = knownTrips(queryClient, uid);
    const key = trips.map((t) => t.id).join(',');
    if (key !== allowedFor) {
      allowed = new Set(offlineTripSet(trips, new Date()));
      allowedFor = key;
    }
    return allowed;
  };

  const [unsub, restored] = persistQueryClient({
    queryClient,
    persister,
    buster: cacheBuster(uid),
    maxAge: OFFLINE_MAX_AGE_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => shouldPersistQuery(q.queryKey, q.state.data !== undefined, allowedTrips(), uid),
      // A paused write can't resume after a restart (no mutationFn), so none are saved.
      shouldDehydrateMutation: () => false,
    },
  });
  unsubscribe = unsub;
  await restored.catch((e) => console.warn('[offline] restore failed:', e));
  // Signed out (or switched) while the saved copy was still being read: put memory back the way stop left it.
  if (myGeneration !== generation) queryClient.clear();
}

export async function stopPersistence(queryClient: QueryClient, opts: { wipe: boolean }): Promise<void> {
  generation++;
  activeBuster = null; // any late throttled write is now refused
  unsubscribe?.();
  unsubscribe = null;
  if (opts.wipe) {
    lastUid = null;
    queryClient.clear();
    await Promise.resolve(persister.removeClient()).catch((e: unknown) => console.warn('[offline] wipe failed:', e));
  }
}
