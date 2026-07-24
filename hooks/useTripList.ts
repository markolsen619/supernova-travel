import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  DocumentData,
} from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { Trip } from '@/types';

// Older trips predate the budget feature — default rather than leaving
// `undefined`, which the Trip type (number | null, not optional) doesn't
// account for.
function normalizeTrip(id: string, data: DocumentData): Trip {
  return {
    id,
    ...data,
    budgetAmount: data.budgetAmount ?? null,
    budgetCurrency: data.budgetCurrency ?? null,
  } as Trip;
}

async function fetchUserTrips(uid: string): Promise<Trip[]> {
  const q = query(
    collection(db, 'trips'),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => normalizeTrip(doc.id, doc.data()));
}

async function fetchPublicTrips(limitCount = 20): Promise<Trip[]> {
  const q = query(
    collection(db, 'trips'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => normalizeTrip(doc.id, doc.data()));
}

export function useTripList(uid: string | null) {
  return useQuery({
    queryKey: ['trips', uid],
    queryFn: () => fetchUserTrips(uid!),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePublicTrips(count = 20) {
  return useQuery({
    queryKey: ['publicTrips', count],
    queryFn: () => fetchPublicTrips(count),
    staleTime: 5 * 60 * 1000,
  });
}
