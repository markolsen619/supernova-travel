import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';

export interface AuthorInfo {
  name: string;
  avatarUrl: string | null;
}

// Firestore `in` queries cap at 30 values per query.
const CHUNK_SIZE = 30;

async function fetchAuthorProfiles(uids: string[]): Promise<Record<string, AuthorInfo>> {
  const unique = Array.from(new Set(uids));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE));
  }

  const result: Record<string, AuthorInfo> = {};
  await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
      snap.docs.forEach((d) => {
        const data = d.data();
        result[d.id] = {
          name: data.fullName ?? data.displayName ?? 'Traveler',
          avatarUrl: data.avatarUrl ?? null,
        };
      });
    }),
  );
  return result;
}

/**
 * Batched author lookup for trip lists that can span multiple authors
 * (saved trips, trending/explore trips) — a `Trip` only stores `authorUid`,
 * so any list showing "by {name}" needs this. One `in` query per 30 unique
 * authors rather than one read per trip card. Feed this into `TripCard`'s
 * `author` prop as `authorProfiles[trip.authorUid]`.
 */
export function useAuthorProfiles(uids: string[]) {
  const key = Array.from(new Set(uids)).sort().join(',');
  return useQuery({
    queryKey: ['authorProfiles', key],
    queryFn: () => fetchAuthorProfiles(uids),
    enabled: uids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
