import { useMemo } from 'react';
import { collection, documentId, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useModeration } from '@/hooks/useModeration';
import { toUserProfile } from '@/hooks/useExplore';
import { rankSuggestions, type SuggestionCandidate } from '@/utils/travelerSuggestions';
import type { UserProfile } from '@/types';

export type TravelerSuggestion = SuggestionCandidate & { username: string; tripsCount: number; profile: UserProfile };

async function fetchCandidates(uid: string): Promise<{ candidates: TravelerSuggestion[]; following: string[] }> {
  const [posts, popular, follows] = await Promise.all([
    getDocs(query(collection(db, 'posts'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(30))),
    getDocs(query(collection(db, 'users'), orderBy('followersCount', 'desc'), limit(30))),
    getDocs(query(collection(db, 'follows'), where('followerUid', '==', uid), limit(300))),
  ]);
  const lastPost = new Map<string, number>();
  for (const p of posts.docs) {
    const a = p.get('authorUid') as string | undefined;
    if (a && !lastPost.has(a)) lastPost.set(a, p.get('createdAt')?.toMillis?.() ?? 0);
  }
  const users = new Map(popular.docs.map((d) => [d.id, d.data()]));
  const missing = [...lastPost.keys()].filter((a) => !users.has(a));
  for (let i = 0; i < missing.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', missing.slice(i, i + 30))));
    for (const d of snap.docs) users.set(d.id, d.data());
  }
  const candidates = [...users.entries()].map(([id, data]) => {
    const profile = toUserProfile(id, data);
    return {
      uid: id, name: profile.fullName, avatarUrl: profile.avatarUrl ?? null,
      isPrivate: profile.settings?.privacy === 'private', isEditorial: !!data.isEditorial, moderationHidden: !!data.moderationHidden,
      followersCount: profile.followersCount ?? 0, lastPostMs: lastPost.get(id) ?? null,
      username: profile.username, tripsCount: profile.tripsCount ?? 0, profile,
    };
  });
  return { candidates, following: follows.docs.map((d) => d.get('followeeUid') as string).filter(Boolean) };
}

/** Travelers to follow (spec 2026-10-24-seed-social-design.md §2), for onboarding and the feed. Cached 10 minutes. */
export function useTravelerSuggestions(): { suggestions: TravelerSuggestion[]; followingCount: number; isLoading: boolean } {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const moderation = useModeration();
  const { data, isLoading } = useQuery({ queryKey: ['travelerSuggestions', uid], queryFn: () => fetchCandidates(uid!), enabled: !!uid, staleTime: 10 * 60 * 1000 });
  return useMemo(() => {
    if (!data) return { suggestions: [], followingCount: 0, isLoading };
    const following = new Set(data.following);
    return { suggestions: rankSuggestions(data.candidates, { selfUid: uid, following, blocked: moderation.blockedUids }), followingCount: following.size, isLoading };
  }, [data, isLoading, moderation, uid]);
}
