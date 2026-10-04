import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Reservation } from '@/types';

export function useReservations() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!uid) return [];
      const q = query(
        collection(db, 'reservations'),
        where('ownerUid', '==', uid),
        orderBy('checkIn', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Reservation));
    },
  });

  const addReservation = useMutation({
    mutationFn: async (reservation: Omit<Reservation, 'id'>) => {
      const ref = await addDoc(collection(db, 'reservations'), reservation);
      return ref.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', uid] });
      // Edits and deletes show on the trip page (useTripBookings).
      queryClient.invalidateQueries({ queryKey: ['tripBookings'] });
    },
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Reservation> & { id: string }) => {
      await updateDoc(doc(db, 'reservations', id), updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', uid] });
      // Edits and deletes show on the trip page (useTripBookings).
      queryClient.invalidateQueries({ queryKey: ['tripBookings'] });
    },
  });

  const deleteReservation = useMutation({
    mutationFn: async (reservationId: string) => {
      await deleteDoc(doc(db, 'reservations', reservationId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', uid] });
      // Edits and deletes show on the trip page (useTripBookings).
      queryClient.invalidateQueries({ queryKey: ['tripBookings'] });
    },
  });

  return { reservations, isLoading, addReservation, updateReservation, deleteReservation };
}
