import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { LoyaltyProgram } from '@/types';

export function useLoyaltyPrograms() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data: loyaltyPrograms = [], isLoading } = useQuery({
    queryKey: ['loyaltyPrograms', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!uid) return [];
      const q = query(
        collection(db, 'loyalty_programs'),
        where('ownerUid', '==', uid),
        orderBy('programName', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LoyaltyProgram));
    },
  });

  const addProgram = useMutation({
    mutationFn: async (program: Omit<LoyaltyProgram, 'id'>) => {
      await addDoc(collection(db, 'loyalty_programs'), program);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyaltyPrograms', uid] }),
  });

  const deleteProgram = useMutation({
    mutationFn: async (programId: string) => {
      await deleteDoc(doc(db, 'loyalty_programs', programId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyaltyPrograms', uid] }),
  });

  return { loyaltyPrograms, isLoading, addProgram, deleteProgram };
}
