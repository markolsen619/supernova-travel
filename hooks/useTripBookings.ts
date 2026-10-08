import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { BoardingPass, Reservation } from '@/types';
import type { TripBooking } from '@/utils/bookingDays';
import { fromSharedDoc, mergeTripBookings } from '@/utils/sharedBookings';

/**
 * Other members' bookings shared with a trip: the barcode-free copies under
 * `trips/{id}/bookings` (members only). A failed read is "none", so it can
 * never take your own bookings down with it.
 */
export async function fetchSharedBookings(tripId: string): Promise<TripBooking[]> {
  try {
    const snap = await getDocs(collection(db, 'trips', tripId, 'bookings'));
    return snap.docs.map((d) => fromSharedDoc(d.data())).filter((b): b is TripBooking => !!b);
  } catch (err) {
    console.warn('[wallet] shared bookings unavailable', err);
    return [];
  }
}

/**
 * This trip's bookings for a member: your own wallet items linked to it
 * (`ownerUid == me`, the (ownerUid, tripId) indexes) plus what the other
 * members share with it. Callers enable it only for members.
 */
export function useTripBookings(tripId: string | null) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['tripBookings', tripId, uid],
    enabled: !!tripId && !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<TripBooking[]> => {
      const [passes, reservations, shared] = await Promise.all([
        getDocs(query(collection(db, 'boarding_passes'), where('ownerUid', '==', uid), where('tripId', '==', tripId))),
        getDocs(query(collection(db, 'reservations'), where('ownerUid', '==', uid), where('tripId', '==', tripId))),
        fetchSharedBookings(tripId!),
      ]);
      const own: TripBooking[] = [
        ...passes.docs.map((d) => ({ kind: 'boarding_pass' as const, item: { id: d.id, ...d.data() } as BoardingPass })),
        ...reservations.docs.map((d) => ({ kind: 'reservation' as const, item: { id: d.id, ...d.data() } as Reservation })),
      ];
      return mergeTripBookings(own, shared, uid!);
    },
  });
  return { bookings, isLoading };
}

/** Other members' shared bookings across several of your trips (Wallet → By trip). */
export function useSharedTripBookings(tripIds: string[], enabled: boolean) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const key = [...tripIds].sort().join(',');
  const { data = [], isLoading } = useQuery({
    queryKey: ['sharedTripBookings', uid, key],
    enabled: enabled && !!uid && tripIds.length > 0,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<TripBooking[]> => {
      const all = await Promise.all(tripIds.map(fetchSharedBookings));
      return mergeTripBookings([], all.flat(), uid!);
    },
  });
  return { shared: data, isLoading };
}
