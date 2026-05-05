import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { algoliasearch } from 'algoliasearch';
import { Hit } from '@algolia/client-search';
import { UserProfile, Trip } from '@/types';

const client = algoliasearch(
  process.env.EXPO_PUBLIC_ALGOLIA_APP_ID ?? '',
  process.env.EXPO_PUBLIC_ALGOLIA_SEARCH_KEY ?? '',
);

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
        users: usersResult.hits.map((h: Hit<UserProfile>) => ({ ...h, uid: h.objectID })),
        trips: tripsResult.hits.map((h: Hit<Trip>) => ({ ...h, id: h.objectID })),
      };
    },
  });

  return {
    users: data?.users ?? [],
    trips: data?.trips ?? [],
    isSearching: isFetching,
  };
}
