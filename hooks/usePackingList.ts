import { useEffect, useRef } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { generatePackingList } from '@/services/packingTemplates';
import type { PackingItem, Trip } from '@/types';

async function fetchPackingItems(tripId: string): Promise<PackingItem[]> {
  const snap = await getDocs(query(collection(db, 'trips', tripId, 'packingItems'), orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PackingItem);
}

/**
 * Fetches the packing list, silently seeds it from the generated template
 * the first time an owner opens a trip with none yet (mirrors
 * useTripCoverResolver's silent-once-owner-gated precedent), and exposes
 * add/toggle/delete. A non-owner just sees whatever's already there — no
 * separate "share" step, being a collaborator is what grants access at all
 * (firestore.rules).
 */
export function usePackingList(trip: Trip | undefined, isOwner: boolean, uid: string) {
  const queryClient = useQueryClient();
  const tripId = trip?.id ?? null;
  const queryKey = ['packingItems', tripId];

  const itemsQuery = useQuery({
    queryKey,
    queryFn: () => fetchPackingItems(tripId!),
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });

  const seeded = useRef(false);
  useEffect(() => {
    if (!trip || !isOwner || !itemsQuery.data || seeded.current) return;
    if (itemsQuery.data.length > 0) return;
    seeded.current = true;
    (async () => {
      const template = generatePackingList(trip);
      const batch = writeBatch(db);
      template.forEach((item) => {
        const ref = doc(collection(db, 'trips', trip.id, 'packingItems'));
        batch.set(ref, {
          label: item.label,
          category: item.category,
          checked: false,
          isCustom: false,
          addedByUid: uid,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      queryClient.invalidateQueries({ queryKey });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey is derived from tripId, already a dep via trip
  }, [trip, isOwner, itemsQuery.data, uid, queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addItem = useMutation({
    mutationFn: ({ label, category, addedByUid }: { label: string; category: string; addedByUid: string }) =>
      addDoc(collection(db, 'trips', tripId!, 'packingItems'), {
        label,
        category,
        checked: false,
        isCustom: true,
        addedByUid,
        createdAt: serverTimestamp(),
      }),
    onSuccess: invalidate,
  });

  const toggleItem = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      updateDoc(doc(db, 'trips', tripId!, 'packingItems', itemId), { checked }),
    onMutate: async ({ itemId, checked }) => {
      const previous = queryClient.getQueryData<PackingItem[]>(queryKey);
      queryClient.setQueryData<PackingItem[]>(queryKey, (old) =>
        old?.map((item) => (item.id === itemId ? { ...item, checked } : item)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => deleteDoc(doc(db, 'trips', tripId!, 'packingItems', itemId)),
    onSuccess: invalidate,
  });

  return {
    items: itemsQuery.data ?? [],
    isLoading: itemsQuery.isLoading,
    addItem,
    toggleItem,
    deleteItem,
  };
}
