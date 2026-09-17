import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { algoliasearch } from 'algoliasearch';
import { Hit } from '@algolia/client-search';
import { UserProfile, Trip } from '@/types';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';

const APP_ID = process.env.EXPO_PUBLIC_ALGOLIA_APP_ID ?? '';
const SEARCH_KEY = process.env.EXPO_PUBLIC_ALGOLIA_SEARCH_KEY ?? '';
const client = APP_ID && SEARCH_KEY ? algoliasearch(APP_ID, SEARCH_KEY) : null;

export function useSearch(searchText: string): {
  users: UserProfile[];
  trips: Trip[];
  isSearching: boolean;
} {
  const [debouncedText, setDebouncedText] = useState(searchText);

  useEffect(() => {
    if (searchText.trim().length < 2) {
      setDebouncedText('');
      return;
    }
    const timer = setTimeout(() => setDebouncedText(searchText.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debouncedText],
    enabled: debouncedText.length >= 2,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!client) return { users: [], trips: [] };
      const [usersResult, tripsResult] = await Promise.all([
        client.searchSingleIndex<UserProfile>({
          indexName: 'users',
          searchParams: { query: debouncedText, hitsPerPage: 20 },
        }),
        client.searchSingleIndex<Trip>({
          indexName: 'trips',
          searchParams: { query: debouncedText, hitsPerPage: 20 },
        }),
      ]);
      return {
        // Algolia hits typed loosely for `fullName`: records indexed before
        // the displayName→fullName rename only have the legacy attribute
        // until syncUserToAlgolia next fires for that user (profile edit
        // self-heals it, same pattern as the username backfill) — fall back
        // here so search never shows a blank name in the meantime.
        users: usersResult.hits.map((h: Hit<UserProfile> & { displayName?: string }) => ({
          ...h,
          uid: h.objectID,
          fullName: h.fullName ?? h.displayName ?? '',
        })),
        trips: tripsResult.hits.map((h: Hit<Trip>) => ({ ...h, id: h.objectID })),
      };
    },
  });

  // Search is Algolia, which knows nothing about who you blocked or what you
  // reported, so the same filters as every Firestore-backed list apply here.
  const moderation = useModeration();
  const users = useMemo(
    () => (data?.users ?? []).filter((u) => !moderation.blockedUids.has(u.uid)),
    [data, moderation],
  );
  const trips = useMemo(
    () =>
      filterVisible(data?.trips ?? [], moderation, (t) => ({
        authorUid: t.authorUid,
        key: contentKey({ type: 'trip', id: t.id }),
        moderationHidden: t.moderationHidden,
      })),
    [data, moderation],
  );

  return {
    users,
    trips,
    isSearching: isFetching,
  };
}
