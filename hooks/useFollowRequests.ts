import { useCallback } from 'react';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db, functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';

const requestId = (requesterUid: string, targetUid: string) => `${requesterUid}_${targetUid}`;

/**
 * Your pending request to follow a private account: whether one exists, and
 * sending or cancelling it. The rules only accept it to a private account you
 * don't already follow and haven't blocked (or been blocked by).
 */
export function useFollowRequest(targetUid: string, targetPrivate = true) {
  const me = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  const key = ['followRequest', me, targetUid];

  const { data: hasRequested = false } = useQuery({
    queryKey: key,
    queryFn: async () => (await getDoc(doc(db, 'followRequests', requestId(me, targetUid)))).exists(),
    // Only a private account can have a pending request — skip the read otherwise.
    enabled: !!me && !!targetUid && me !== targetUid && targetPrivate,
    staleTime: 60 * 1000,
  });

  const request = useCallback(async () => {
    const profile = useUserStore.getState().profile;
    queryClient.setQueryData(key, true); // optimistic
    try {
      await setDoc(doc(db, 'followRequests', requestId(me, targetUid)), {
        requesterUid: me,
        targetUid,
        requesterName: profile?.fullName || 'A traveler',
        requesterAvatarUrl: profile?.avatarUrl ?? null,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      queryClient.setQueryData(key, false);
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is derived from me + targetUid
  }, [me, targetUid, queryClient]);

  const cancel = useCallback(async () => {
    queryClient.setQueryData(key, false); // optimistic
    try {
      await deleteDoc(doc(db, 'followRequests', requestId(me, targetUid)));
    } catch (e) {
      queryClient.setQueryData(key, true);
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is derived from me + targetUid
  }, [me, targetUid, queryClient]);

  return { hasRequested, request, cancel };
}

/** Accept or decline a request to follow you (the respondToFollowRequest callable). */
export function useRespondToFollowRequest() {
  const me = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requesterUid: string; accept: boolean }) => {
      const fn = httpsCallable<{ requesterUid: string; accept: boolean }, { status: string }>(functions, 'respondToFollowRequest');
      return (await fn(input)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile', me] });
      queryClient.invalidateQueries({ queryKey: ['connections', me, 'followers'] });
    },
  });
}
