import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { TripWithDays, TripDay, TripActivity } from '@/types';

async function fetchTripWithDays(tripId: string): Promise<TripWithDays | null> {
  // Step 1: fetch the trip document
  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) {
    return null;
  }
  const trip = { id: tripSnap.id, ...tripSnap.data() } as TripWithDays;

  // Step 2: fetch all days ordered by dayNumber
  const daysQuery = query(
    collection(db, 'trips', tripId, 'days'),
    orderBy('dayNumber')
  );
  const daysSnap = await getDocs(daysQuery);
  const dayDocs = daysSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Omit<TripDay, 'activities'>[];

  // Step 3: fetch activities for each day in parallel
  const daysWithActivities: TripDay[] = await Promise.all(
    dayDocs.map(async (day) => {
      const activitiesQuery = query(
        collection(db, 'trips', tripId, 'days', day.id, 'activities'),
        orderBy('order')
      );
      const activitiesSnap = await getDocs(activitiesQuery);
      const activities = activitiesSnap.docs.map((a) => ({
        id: a.id,
        ...a.data(),
      })) as TripActivity[];
      return { ...day, activities };
    })
  );

  return { ...trip, days: daysWithActivities };
}

export function useTrip(tripId: string | null) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTripWithDays(tripId!),
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });
}
