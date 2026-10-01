import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * A like on anything with a `likes/` subcollection and a `likesCount`: one
 * like doc per user plus the count, in one transaction. Optimistic — the heart
 * flips at once and reverts if the write fails. A toggle while one is in
 * flight is refused rather than queued, so fast repeated taps can't leave the
 * count off by one. `setLiked` returns whether it was accepted.
 *
 * @param parentPath the liked document, e.g. ['posts', id]
 * @param likeId the like doc's id for the signed-in user
 */
function useLikeToggle(parentPath: string[], likeId: (uid: string) => string): {
  liked: boolean;
  setLiked: (next: boolean) => boolean;
} {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [liked, setLikedState] = useState(false);
  const busy = useRef(false);
  const key = parentPath.join('/');

  // Seed the real liked state — one cheap keyed read.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, key, 'likes', likeId(uid)))
      .then((snap) => { if (!cancelled) setLikedState(snap.exists()); })
      .catch(() => {});
    return () => { cancelled = true; };
    // likeId is a pure function of uid + the parent; key covers the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  const setLiked = useCallback((next: boolean) => {
    if (!uid || busy.current) return false;
    busy.current = true;
    setLikedState(next); // optimistic
    const likeRef = doc(db, key, 'likes', likeId(uid));
    const parentRef = doc(db, key);
    // Transactions require every read before the first write.
    runTransaction(db, async (tx) => {
      const likeSnap = await tx.get(likeRef);
      const parentSnap = await tx.get(parentRef);
      const count = parentSnap.data()?.likesCount ?? 0;
      if (next && !likeSnap.exists()) {
        tx.set(likeRef, { uid, createdAt: serverTimestamp() });
        tx.update(parentRef, { likesCount: count + 1 });
      } else if (!next && likeSnap.exists()) {
        tx.delete(likeRef);
        tx.update(parentRef, { likesCount: Math.max(0, count - 1) });
      }
    })
      .catch((err) => {
        console.error('[useLikeToggle] like failed:', err);
        setLikedState(!next); // revert
      })
      .finally(() => { busy.current = false; });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  return { liked, setLiked };
}

/** Your like on a post — shared by FeedCard's heart button and its double tap. */
export function usePostLike(postId: string) {
  return useLikeToggle(['posts', postId], (uid) => `${uid}_${postId}`);
}

/** Your like on a comment (posts/{postId}/comments/{commentId}/likes/{uid}). */
export function useCommentLike(postId: string, commentId: string) {
  return useLikeToggle(['posts', postId, 'comments', commentId], (uid) => uid);
}
