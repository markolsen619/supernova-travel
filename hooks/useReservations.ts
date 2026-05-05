import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
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
      await addDoc(collection(db, 'reservations'), reservation);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations', uid] }),
  });

  const deleteReservation = useMutation({
    mutationFn: async (reservationId: string) => {
      await deleteDoc(doc(db, 'reservations', reservationId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations', uid] }),
  });

  return { reservations, isLoading, addReservation, deleteReservation };
}
