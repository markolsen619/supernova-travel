import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { BoardingPass, Reservation } from '@/types';
import type { TripBooking } from '@/utils/bookingDays';

/**
 * Your wallet bookings linked to this trip. Always filtered to your own
 * (`ownerUid == me`) — that is what keeps them private on a shared trip.
 * Uses the (ownerUid, tripId) indexes.
 */
export function useTripBookings(tripId: string | null) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['tripBookings', tripId, uid],
    enabled: !!tripId && !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<TripBooking[]> => {
      const [passes, reservations] = await Promise.all([
        getDocs(query(collection(db, 'boarding_passes'), where('ownerUid', '==', uid), where('tripId', '==', tripId))),
        getDocs(query(collection(db, 'reservations'), where('ownerUid', '==', uid), where('tripId', '==', tripId))),
      ]);
      return [
        ...passes.docs.map((d) => ({ kind: 'boarding_pass' as const, item: { id: d.id, ...d.data() } as BoardingPass })),
        ...reservations.docs.map((d) => ({ kind: 'reservation' as const, item: { id: d.id, ...d.data() } as Reservation })),
      ];
    },
  });
  return { bookings, isLoading };
}
