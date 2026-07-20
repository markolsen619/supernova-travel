import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Post } from '@/types';

/**
 * Feed bookmark → users/{uid}/savedTrips — the same owner-only subcollection
 * both Saved renderers (profile tab + SavedGrid) read, so a save here shows
 * up there immediately.
 *
 * Two shapes share the collection:
 * - trip-linked post → a snapshot of the real trip doc, keyed by tripId
 *   (re-saving from any post of that trip dedupes onto the same entry);
 * - photo/video post → a trip-card-renderable record keyed by postId with
 *   `savedType: 'post'`, which the renderers route to /post/{postId}.
 */
export function useSavePost(post: Post) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  const savedId = post.tripId ?? post.id;

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, 'users', uid, 'savedTrips', savedId))
      .then((snap) => { if (!cancelled) setSaved(snap.exists()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uid, savedId]);

  const toggleSave = useCallback(async () => {
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'savedTrips', savedId);
    const next = !saved;
    setSaved(next); // optimistic
    try {
      if (!next) {
        await deleteDoc(ref);
      } else if (post.tripId) {
        // Snapshot the trip so the Saved tab renders it even if the original
        // later changes visibility. Falls back to the post-shaped record if
        // the trip is gone or unreadable.
        const tripSnap = await getDoc(doc(db, 'trips', post.tripId)).catch(() => null);
        if (tripSnap?.exists()) {
          await setDoc(ref, { ...tripSnap.data(), savedAt: serverTimestamp() });
        } else {
          await setDoc(ref, postShapedRecord(post));
        }
      } else {
        await setDoc(ref, postShapedRecord(post));
      }
      queryClient.invalidateQueries({ queryKey: ['savedTrips'] });
    } catch (err) {
      console.error('[useSavePost] toggle failed:', err);
      setSaved(!next); // revert optimistic state
    }
  }, [uid, saved, savedId, post, queryClient]);

  return { saved, toggleSave };
}

/** Minimal trip-card-renderable shape for a saved non-trip post. Omits
 * `status` deliberately — TripCard hides its status badge when absent. */
function postShapedRecord(post: Post) {
  return {
    savedType: 'post' as const,
    postId: post.id,
    title: post.caption || post.placeName || 'Travel moment',
    destination: {
      name: post.placeName ?? `${post.authorDisplayName}'s moment`,
      placeId: post.placeId,
      lat: post.lat,
      lng: post.lng,
      countryCode: null,
    },
    coverImageUrl: post.thumbnailUrl ?? post.mediaUrl,
    startDate: null,
    endDate: null,
    savedAt: serverTimestamp(),
  };
}
