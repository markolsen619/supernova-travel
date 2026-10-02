import { useMemo } from 'react';
import { collection, documentId, getDocs, limit, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import type { UserProfile } from '@/types';
import { useModeration } from '@/hooks/useModeration';
import { connectionQuery, connectionUids, type ConnectionKind } from '@/utils/connections';

/** Plenty for a travel app's follow lists; beyond it, the newest are shown. */
const MAX = 300;

async function fetchConnections(uid: string, kind: ConnectionKind): Promise<UserProfile[]> {
  const { matchField } = connectionQuery(kind);
  // No orderBy: where() + orderBy() on another field would need a declared
  // composite index. Sorted newest-first here instead.
  const snap = await getDocs(query(collection(db, 'follows'), where(matchField, '==', uid), limit(MAX)));
  const follows = snap.docs
    .map((d) => d.data() as { followerUid?: string; followeeUid?: string; createdAt?: { toMillis?: () => number } })
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  const uids = connectionUids(follows, kind);

  const byUid = new Map<string, UserProfile>();
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    const users = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
    for (const d of users.docs) {
      const data = d.data();
      const fullName: string = data.fullName ?? data.displayName ?? '';
      byUid.set(d.id, {
        uid: d.id,
        fullName,
        username: data.username ?? '',
        avatarUrl: data.avatarUrl ?? null,
        bio: data.bio ?? '',
        location: data.location ?? '',
        followersCount: data.followersCount ?? 0,
        followingCount: data.followingCount ?? 0,
        tripsCount: data.tripsCount ?? 0,
        settings: { privacy: data.settings?.privacy === 'private' ? 'private' : 'public' },
        tier: data.tier ?? 'free',
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      } as UserProfile);
    }
  }
  // Follow order, minus accounts that no longer exist.
  return uids.map((u) => byUid.get(u)).filter((u): u is UserProfile => !!u);
}

/** A profile's followers or following, minus anyone you've blocked. */
export function useConnections(uid: string, kind: ConnectionKind) {
  const moderation = useModeration();
  const q = useQuery({
    queryKey: ['connections', uid, kind],
    queryFn: () => fetchConnections(uid, kind),
    enabled: !!uid,
    staleTime: 60 * 1000,
  });
  const users = useMemo(
    () => (q.data ?? []).filter((u) => !moderation.blockedUids.has(u.uid)),
    [q.data, moderation],
  );
  return { users, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
