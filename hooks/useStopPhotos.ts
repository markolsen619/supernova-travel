import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useModerationStore } from '@/stores/useModerationStore';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { stopPhotos, type StopPhoto } from '@/utils/playback';

/**
 * Photos the trip's members took at each stop, for the playback card (owner, 2026-10-17): the stop's journal
 * photos and members' place-review photos. Loaded only while a playback runs (`enabled`), then cached.
 */
export function useStopPhotos(a: {
  tripId: string;
  stops: { id: string; dayId: string; placeId: string | null }[];
  memberUids: string[];
  organizerUid: string | null;
  enabled: boolean;
}): Record<string, StopPhoto[]> {
  const blocked = useModerationStore((s) => s.blockedUids);
  const { data: profiles = {} } = useAuthorProfiles(a.memberUids);
  const { data } = useQuery({
    queryKey: ['stopPhotos', a.tripId, a.stops.map((s) => s.id).join(','), a.memberUids.join(',')],
    enabled: a.enabled && a.stops.length > 0 && !!a.organizerUid,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const journals: Record<string, string[]> = {};
      await Promise.all(a.stops.map(async (s) => {
        const snap = await getDoc(doc(db, 'trips', a.tripId, 'days', s.dayId, 'activities', s.id, 'journal', 'entry')).catch(() => null);
        const urls = snap?.exists() ? snap.get('photoUrls') : null;
        if (Array.isArray(urls) && urls.length) journals[s.id] = urls.filter((u): u is string => typeof u === 'string');
      }));
      // Members' place photos: one query (≤ 10 members per `in`), then matched to the trip's places.
      const placeIds = new Set(a.stops.map((s) => s.placeId).filter((p): p is string => !!p));
      const reviews: { uid: string; placeId: string; photoUrls: string[]; moderationHidden?: boolean }[] = [];
      if (placeIds.size) {
        const snap = await getDocs(query(collection(db, 'placeReviews'), where('authorUid', 'in', a.memberUids.slice(0, 10)))).catch(() => null);
        snap?.docs.forEach((d) => {
          const r = d.data();
          if (typeof r.placeId === 'string' && placeIds.has(r.placeId) && Array.isArray(r.photoUrls) && r.photoUrls.length) {
            reviews.push({ uid: String(r.authorUid), placeId: r.placeId, photoUrls: r.photoUrls, moderationHidden: r.moderationHidden === true });
          }
        });
      }
      return { journals, reviews };
    },
  });
  if (!data || !a.organizerUid) return {};
  return stopPhotos(a.stops, data.journals, a.organizerUid, data.reviews, a.memberUids, profiles, new Set(blocked));
}
