import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  DocumentSnapshot,
  where,
} from 'firebase/firestore';
import { useInfiniteQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Post } from '@/types';

const PAGE_SIZE = 10;

async function fetchFeedPage(
  uid: string,
  cursor: DocumentSnapshot | null,
  tab: 'forYou' | 'following'
): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
  // TODO: switch to users/{uid}/feed subcollection after Cloud Functions are deployed
  let q = query(
    collection(db, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE)
  );

  if (tab === 'following') {
    // Temporary: show own posts for Following tab until follow graph + fan-out is ready
    q = query(
      collection(db, 'posts'),
      where('authorUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }

  if (cursor) {
    q = query(q, startAfter(cursor));
  }

  const snap = await getDocs(q);
  const posts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Post));
  const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
  return { posts, lastDoc };
}

export function useFeed(tab: 'forYou' | 'following' = 'forYou') {
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  return useInfiniteQuery({
    queryKey: ['feed', uid, tab],
    queryFn: ({ pageParam }) =>
      fetchFeedPage(uid, pageParam as DocumentSnapshot | null, tab),
    initialPageParam: null as DocumentSnapshot | null,
    getNextPageParam: (lastPage) => lastPage.lastDoc,
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}
