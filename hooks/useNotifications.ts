import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
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
