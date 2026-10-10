import { useCallback } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db, storage } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { reviewId } from '@/utils/placeReviews';

/** A place review as the app reads it (docs/superpowers/specs/2026-10-09-place-reviews-design.md). */
export interface PlaceReview {
  id: string;
  placeId: string;
  placeName: string;
  authorUid: string;
  authorName: string;
  authorAvatarUrl: string | null;
  rating: number | null;
  text: string;
  photoUrls: string[];
  visited: boolean;
  moderationHidden: boolean;
  updatedAtMs: number;
}

export interface PlaceStats {
  reviewCount: number;
  ratingCount: number;
  ratingSum: number;
  photoCount: number;
  latestPhotos: { url: string; reviewId: string }[];
}

const toReview = (id: string, d: Record<string, any>): PlaceReview => ({
  id,
  placeId: String(d.placeId ?? ''),
  placeName: String(d.placeName ?? ''),
  authorUid: String(d.authorUid ?? ''),
  authorName: String(d.authorName ?? 'A traveler'),
  authorAvatarUrl: d.authorAvatarUrl ?? null,
  rating: typeof d.rating === 'number' ? d.rating : null,
  text: String(d.text ?? ''),
  photoUrls: Array.isArray(d.photoUrls) ? d.photoUrls : [],
  visited: d.visited === true,
  moderationHidden: d.moderationHidden === true,
  updatedAtMs: d.updatedAt?.toMillis?.() ?? 0,
});

/** A place's totals (server-kept). Null until someone reviews it. */
export function usePlaceStats(placeId: string | null | undefined) {
  return useQuery({
    queryKey: ['placeStats', placeId],
    enabled: !!placeId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<PlaceStats | null> => {
      const snap = await getDoc(doc(db, 'placeStats', placeId!));
      return snap.exists() ? (snap.data() as PlaceStats) : null;
    },
  });
}

/** Every review of a place (unsorted — callers order them; no composite index needed). */
export function usePlaceReviews(placeId: string | null | undefined) {
  return useQuery({
    queryKey: ['placeReviews', placeId],
    enabled: !!placeId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<PlaceReview[]> => {
      const snap = await getDocs(query(collection(db, 'placeReviews'), where('placeId', '==', placeId)));
      return snap.docs.map((d) => toReview(d.id, d.data()));
    },
  });
}

/** Your own review of a place, if you've written one. */
export function useMyReview(placeId: string | null | undefined) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  return useQuery({
    queryKey: ['myPlaceReview', placeId, uid],
    enabled: !!placeId && !!uid,
    queryFn: async (): Promise<PlaceReview | null> => {
      const snap = await getDoc(doc(db, 'placeReviews', reviewId(placeId!, uid!)));
      return snap.exists() ? toReview(snap.id, snap.data()) : null;
    },
  });
}

async function uploadReviewPhoto(uid: string, placeId: string, uri: string, index: number): Promise<string> {
  const blob = await fetch(uri).then((r) => r.blob());
  const storageRef = ref(storage, `place_photos/${uid}/${placeId}/${Date.now()}_${index}.jpg`);
  const task = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', undefined, (err) => reject(new Error(`Photo upload failed: ${err.message}`)), resolve);
  });
  return getDownloadURL(storageRef);
}

/** Save (create or edit) and delete your review of a place. */
export function usePlaceReviewActions() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const profile = useUserStore((s) => s.profile);
  const queryClient = useQueryClient();

  const refresh = useCallback(async (placeId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['placeReviews', placeId] }),
      queryClient.invalidateQueries({ queryKey: ['myPlaceReview', placeId] }),
      queryClient.invalidateQueries({ queryKey: ['placeStats', placeId] }),
    ]);
  }, [queryClient]);

  /** `photos`: kept remote URLs plus new local URIs (uploaded here). Removed remote photos are deleted from Storage. */
  const save = useCallback(async (p: {
    placeId: string; placeName: string; rating: number | null; text: string;
    photos: string[]; previousPhotos: string[]; isNew: boolean;
  }) => {
    if (!uid) throw new Error('Not signed in');
    const urls: string[] = [];
    for (const [i, uri] of p.photos.entries()) {
      urls.push(uri.startsWith('http') ? uri : await uploadReviewPhoto(uid, p.placeId, uri, i));
    }
    // merge: the server's own fields (visited, moderationHidden) stay as they are.
    await setDoc(doc(db, 'placeReviews', reviewId(p.placeId, uid)), {
      placeId: p.placeId,
      placeName: p.placeName,
      authorUid: uid,
      authorName: profile?.fullName || profile?.username || 'A traveler',
      authorAvatarUrl: profile?.avatarUrl ?? null,
      rating: p.rating,
      text: p.text.trim(),
      photoUrls: urls,
      ...(p.isNew ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    const removed = p.previousPhotos.filter((u) => !urls.includes(u));
    await Promise.all(removed.map((u) => deleteObject(ref(storage, u)).catch(() => undefined)));
    await refresh(p.placeId);
  }, [uid, profile, refresh]);

  const remove = useCallback(async (review: PlaceReview) => {
    await deleteDoc(doc(db, 'placeReviews', review.id));
    await Promise.all(review.photoUrls.map((u) => deleteObject(ref(storage, u)).catch(() => undefined)));
    await refresh(review.placeId);
  }, [refresh]);

  return { save, remove };
}
