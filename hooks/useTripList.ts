import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { Trip } from '@/types';

async function fetchUserTrips(uid: string): Promise<Trip[]> {
  const q = query(
    collection(db, 'trips'),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Trip));
}

async function fetchPublicTrips(limitCount = 20): Promise<Trip[]> {
  const q = query(
    collection(db, 'trips'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Trip));
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
