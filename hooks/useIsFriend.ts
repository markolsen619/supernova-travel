import { doc, getDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';

async function checkMutualFollow(uidA: string, uidB: string): Promise<boolean> {
  const [aFollowsB, bFollowsA] = await Promise.all([
    getDoc(doc(db, 'follows', `${uidA}_${uidB}`)),
    getDoc(doc(db, 'follows', `${uidB}_${uidA}`)),
  ]);
  return aFollowsB.exists() && bFollowsA.exists();
}

/** True only if both users follow each other — the "confirmed friend" gate
 * for direct messaging. Doc ID convention (`${followerUid}_${followeeUid}`)
 * matches useFollow.ts's followDocId(). */
export function useIsFriend(otherUid: string | null) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  return useQuery({
    queryKey: ['isFriend', uid, otherUid],
    queryFn: () => checkMutualFollow(uid, otherUid!),
    enabled: !!uid && !!otherUid && uid !== otherUid,
    staleTime: 2 * 60 * 1000,
  });
}
