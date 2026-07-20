/**
 * components/profile/SavedGrid.tsx
 *
 * Saved-trips list for the public profile screen. Saved trips live in the
 * owner-only users/{uid}/savedTrips subcollection (Firestore rules deny
 * everyone else), so this renders real data only for your own profile and
 * an honest "private" state for anyone else's.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { BookmarkSimple, LockSimple, Compass } from 'phosphor-react-native';

import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { TripCard } from '@/components/trip/TripCard';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { Trip } from '@/types';

async function fetchSavedTrips(uid: string): Promise<Trip[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'savedTrips'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trip));
}

interface SavedGridProps {
  uid: string;
}

export function SavedGrid({ uid }: SavedGridProps) {
  const ownUid = useAuthStore((s) => s.user?.uid);
  const isOwn = !!uid && uid === ownUid;

  const { data: savedTrips = [], isLoading } = useQuery({
    queryKey: ['savedTrips', uid],
    queryFn: () => fetchSavedTrips(uid),
    enabled: isOwn,
    staleTime: 2 * 60 * 1000,
  });

  if (!isOwn) {
    return (
      <EmptyState
        icon={LockSimple}
        title="Saved trips are private"
        description="Only they can see what they've saved."
      />
    );
  }

  if (isLoading) {
    return (
      <View style={styles.list}>
        {[0, 1].map((i) => (
          <SkeletonCard key={i} height={230} radius={BorderRadius.xl} style={{ marginBottom: Spacing['3'] }} />
        ))}
      </View>
    );
  }

  if (savedTrips.length === 0) {
    return (
      <EmptyState
        icon={BookmarkSimple}
        title="No saved trips"
        description="Save trips from your feed to find them here."
        actionLabel="Explore trips"
        actionIcon={Compass}
        onAction={() => router.navigate('/(tabs)/explore')}
        actionHaptic="light"
      />
    );
  }

  return (
    <View style={styles.list}>
      {savedTrips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onPress={() => router.push(`/trip/${trip.id}`)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing['4'],
    gap: Spacing['3'],
  },
});
