import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { BoardingPass } from '@/types';

export function useBoardingPasses() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data: boardingPasses = [], isLoading } = useQuery({
    queryKey: ['boardingPasses', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!uid) return [];
      const q = query(
        collection(db, 'boarding_passes'),
        where('ownerUid', '==', uid),
        orderBy('departureTime', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BoardingPass));
    },
  });

  const addPass = useMutation({
    mutationFn: async (pass: Omit<BoardingPass, 'id'>) => {
      await addDoc(collection(db, 'boarding_passes'), pass);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardingPasses', uid] }),
  });

  const deletePass = useMutation({
    mutationFn: async (passId: string) => {
      await deleteDoc(doc(db, 'boarding_passes', passId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardingPasses', uid] }),
  });

  return { boardingPasses, isLoading, addPass, deletePass };
}
