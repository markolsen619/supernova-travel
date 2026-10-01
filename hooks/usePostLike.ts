import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';

function likeDocId(uid: string, postId: string) {
  return `${uid}_${postId}`;
}

/**
 * Whether you've liked a post, and a toggle — shared by the heart button and
 * the feed's double tap so the two can never disagree. Optimistic: the heart
 * flips at once and reverts if the write fails. A toggle while one is in
 * flight is ignored rather than queued, so a fast double-double-tap can't
 * leave the count off by one. Returns whether the toggle was accepted.
 */
export function usePostLike(postId: string): { liked: boolean; setLiked: (next: boolean) => boolean } {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [liked, setLikedState] = useState(false);
  const busy = useRef(false);

  // Seed the real liked state — one cheap keyed read per card.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, 'posts', postId, 'likes', likeDocId(uid, postId)))
      .then((snap) => { if (!cancelled) setLikedState(snap.exists()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uid, postId]);

  const setLiked = useCallback((next: boolean) => {
    if (!uid || busy.current) return false;
    busy.current = true;
    setLikedState(next); // optimistic
    const likeRef = doc(db, 'posts', postId, 'likes', likeDocId(uid, postId));
    const postRef = doc(db, 'posts', postId);
    // Transactions require every read before the first write.
    runTransaction(db, async (tx) => {
      const likeSnap = await tx.get(likeRef);
      const postSnap = await tx.get(postRef);
      const count = postSnap.data()?.likesCount ?? 0;
      if (next && !likeSnap.exists()) {
        tx.set(likeRef, { uid, createdAt: serverTimestamp() });
        tx.update(postRef, { likesCount: count + 1 });
      } else if (!next && likeSnap.exists()) {
        tx.delete(likeRef);
        tx.update(postRef, { likesCount: Math.max(0, count - 1) });
      }
    })
      .catch((err) => {
        console.error('[usePostLike] like failed:', err);
        setLikedState(!next); // revert
      })
      .finally(() => { busy.current = false; });
    return true;
  }, [uid, postId]);

  return { liked, setLiked };
}
