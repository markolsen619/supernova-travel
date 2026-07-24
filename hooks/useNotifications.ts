import { collection, getDocs, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { AppNotification } from '@/types';

async function fetchNotifications(uid: string): Promise<AppNotification[]> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
}

/** Short staleTime — this is the one place a pending trip invite needs to
 * feel current, not the usual 2-minute default. Still getDocs, not
 * onSnapshot, per the app's existing architecture rule. */
export function useNotifications() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  return useQuery({
    queryKey: ['notifications', uid],
    queryFn: () => fetchNotifications(uid!),
    enabled: !!uid,
    staleTime: 30 * 1000,
  });
}

/** Batch-marks every currently-unread notification `read: true` — called
 * when the Activity tab is viewed. firestore.rules only allows the owner to
 * flip this one field, never author/edit notification content. */
export function useMarkNotificationsRead() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'users', uid, 'notifications'), where('read', '==', false)),
      );
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', uid] });
      queryClient.invalidateQueries({ queryKey: ['hasUnreadActivity', uid] });
    },
  });
}
