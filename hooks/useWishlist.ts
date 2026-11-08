/** The signed-in traveler's private wish list, `users/{uid}/wishlist/{videoId}` (spec 2026-11-06-social-wishlist-design.md). */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireOnline } from '@/services/offline';
import { useAuthStore } from '@/stores/useAuthStore';
import { mergeReshare, type WishPlace, type WishSave } from '@/utils/wishlist';

export function useWishlist() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data: saves = [], isLoading } = useQuery({
    queryKey: ['wishlist', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<WishSave[]> => {
      if (!uid) return [];
      const snap = await getDocs(collection(db, 'users', uid, 'wishlist'));
      return snap.docs.map((d) => {
        const x = d.data();
        return { ...(x as Omit<WishSave, 'savedAtMs'>), videoId: d.id, savedAtMs: x.savedAt?.toMillis?.() ?? 0 };
      });
    },
  });

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['wishlist', uid] }), [queryClient, uid]);

  const save = useCallback(async (w: Omit<WishSave, 'savedAtMs'>) => {
    if (!uid || !requireOnline()) throw new Error('offline');
    // Exactly the keys the rules allow (the server's answer also carries coverUrl, which is never stored).
    // A video saved again keeps its places' "on a trip" marks (final review).
    const merged = mergeReshare(saves.find((s) => s.videoId === w.videoId) ?? null, w);
    const { platform, videoId, postUrl, author, authorHandle, caption, city, country, cityLat, cityLng, places } = merged;
    await setDoc(doc(db, 'users', uid, 'wishlist', videoId), {
      platform, videoId, postUrl, author, authorHandle, caption: caption.slice(0, 300), city, country, cityLat, cityLng,
      places: places.slice(0, 10), savedAt: serverTimestamp(),
    });
    await refresh();
  }, [uid, saves, refresh]);

  const remove = useCallback(async (videoId: string) => {
    if (!uid || !requireOnline()) return;
    await deleteDoc(doc(db, 'users', uid, 'wishlist', videoId));
    await refresh();
  }, [uid, refresh]);

  const setPlaces = useCallback(async (videoId: string, change: (places: WishPlace[]) => WishPlace[]) => {
    if (!uid || !requireOnline()) return;
    const current = saves.find((s) => s.videoId === videoId);
    if (!current) return;
    await updateDoc(doc(db, 'users', uid, 'wishlist', videoId), { places: change(current.places) });
    await refresh();
  }, [uid, saves, refresh]);

  const removePlace = useCallback((videoId: string, placeId: string) => setPlaces(videoId, (ps) => ps.filter((p) => p.id !== placeId)), [setPlaces]);
  const markAdded = useCallback((videoId: string, placeId: string, addedTo: { tripId: string; dayId: string; activityId: string }) =>
    setPlaces(videoId, (ps) => ps.map((p) => (p.id === placeId ? { ...p, addedTo } : p))), [setPlaces]);

  return { saves, isLoading, save, remove, removePlace, markAdded };
}
