// services/queryPersist.ts
/**
 * Keeps the offline slice of the query cache on the phone, one account at a time (spec §1, §4). The buster
 * is per uid, so another account's saved copy is discarded on restore; sign-out wipes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Timestamp } from 'firebase/firestore';
import { cacheBuster, offlineTripSet, OFFLINE_MAX_AGE_MS, reviveTimestamps, shouldPersistQuery } from '@/utils/offlineCache';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'offline-query-cache',
  throttleTime: 2000,
  serialize: (data) => JSON.stringify(data),
  deserialize: (raw) => reviveTimestamps(JSON.parse(raw)),
});

let unsubscribe: (() => void) | null = null;

type DatedTrip = { id: string; startDate: Timestamp | null; endDate: Timestamp | null };

/** The user's own + joined trips, from whichever list is loaded. */
export function knownTrips(queryClient: QueryClient, uid: string): DatedTrip[] {
  const mine = (queryClient.getQueryData<DatedTrip[]>(['myTrips', uid]) ?? []);
  const own = (queryClient.getQueryData<DatedTrip[]>(['trips', uid]) ?? []);
  const byId = new Map<string, DatedTrip>();
  for (const t of [...own, ...mine]) byId.set(t.id, t);
  return [...byId.values()];
}

export async function startPersistence(queryClient: QueryClient, uid: string): Promise<void> {
  unsubscribe?.();
  const [unsub, restored] = persistQueryClient({
    queryClient,
    persister,
    buster: cacheBuster(uid),
    maxAge: OFFLINE_MAX_AGE_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => {
        const allowed = new Set(offlineTripSet(knownTrips(queryClient, uid), new Date()));
        return shouldPersistQuery(q.queryKey, q.state.status, allowed);
      },
    },
  });
  unsubscribe = unsub;
  await restored.catch((e) => console.warn('[offline] restore failed:', e));
}

export async function stopPersistence(queryClient: QueryClient, opts: { wipe: boolean }): Promise<void> {
  unsubscribe?.();
  unsubscribe = null;
  if (opts.wipe) {
    queryClient.clear();
    await Promise.resolve(persister.removeClient()).catch((e: unknown) => console.warn('[offline] wipe failed:', e));
  }
}
