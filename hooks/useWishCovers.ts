/**
 * Covers for saved TikTok posts, from the server (spec 2026-11-10 §3): one call per screen for every post it shows,
 * remembered for an hour. Never persisted offline (not in utils/offlineCache's allow-list). Null = no cover; the card
 * shows its quiet image mark.
 */
import { useQuery } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { coverQuery } from '@/utils/wishlist';

export function useWishCovers(videoIds: string[]): Record<string, string | null> {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { ids, key } = coverQuery(videoIds);
  const { data } = useQuery({
    queryKey: ['wishCovers', uid, key],
    enabled: !!uid && ids.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data: res } = await httpsCallable<{ videoIds: string[] }, { covers: Record<string, string | null> }>(functions, 'wishCovers')({ videoIds: ids });
      return res.covers ?? {};
    },
  });
  return data ?? {};
}
