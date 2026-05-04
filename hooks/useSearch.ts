import { useState, useEffect } from 'react';
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
import { UserProfile, Trip } from '@/types';

async function searchUsers(q: string): Promise<UserProfile[]> {
  const end = q + '';
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('displayName', '>=', q),
      where('displayName', '<=', end),
      limit(15)
    )
  );
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      displayName: data.displayName ?? '',
      username: data.username ?? data.displayName?.toLowerCase().replace(/\s+/g, '') ?? '',
      avatarUrl: data.avatarUrl ?? null,
      bio: data.bio ?? '',
      location: data.location ?? '',
      followersCount: data.followersCount ?? 0,
      followingCount: data.followingCount ?? 0,
      tripsCount: data.tripsCount ?? 0,
      tier: data.tier ?? 'free',
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    } as UserProfile;
  });
}

async function searchTrips(q: string): Promise<Trip[]> {
  const end = q + '';
  const snap = await getDocs(
    query(
      collection(db, 'trips'),
      where('title', '>=', q),
      where('title', '<=', end),
      where('visibility', '==', 'public'),
      limit(15)
    )
  );
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Trip));
}

export function useSearch(query: string): {
  users: UserProfile[];
  trips: Trip[];
  isSearching: boolean;
} {
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debouncedQuery.length >= 2;

  const { data: users = [], isFetching: usersSearching } = useQuery({
    queryKey: ['searchUsers', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled,
    staleTime: 0,
  });

  const { data: trips = [], isFetching: tripsSearching } = useQuery({
    queryKey: ['searchTrips', debouncedQuery],
    queryFn: () => searchTrips(debouncedQuery),
    enabled,
    staleTime: 0,
  });

  const isSearching = enabled && (usersSearching || tripsSearching);

  return { users, trips, isSearching };
}
