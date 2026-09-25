import { collection, deleteDoc, doc, getDocs, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { AppNotification } from '@/types';
import { removeNotification } from '@/utils/notificationActions';

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

/**
 * Removes one notification from the owner's own inbox.
 *
 * Optimistic: the row disappears on touch rather than after a round trip,
 * because a delete the user explicitly asked for should never feel like it
 * might not have worked. onError puts it back — the only realistic failure
 * is offline, and silently swallowing that would leave the user believing
 * something is gone when it is not.
 *
 * firestore.rules allows delete for the owner only; authoring a notification
 * stays Cloud-Functions-only.
 */
export function useDeleteNotification() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  const key = ['notifications', uid];

  return useMutation({
    mutationFn: (notificationId: string) =>
      deleteDoc(doc(db, 'users', uid, 'notifications', notificationId)),

    onMutate: async (notificationId: string) => {
      // Cancel first, or an in-flight refetch can land after this and
      // resurrect the row.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AppNotification[]>(key);
      queryClient.setQueryData<AppNotification[]>(key, (current) =>
        removeNotification(current, notificationId),
      );
      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['hasUnreadActivity', uid] });
    },
  });
}
