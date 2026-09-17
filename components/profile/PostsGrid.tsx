/**
 * components/profile/PostsGrid.tsx
 *
 * Public-profile posts grid — same query pattern as the own-profile Posts
 * tab in app/(tabs)/profile.tsx, parameterized by uid. Rendered inside the
 * profile ScrollView, so this is a flex-wrap grid rather than a FlashList.
 */

import React, { useMemo } from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { SquaresFour } from 'phosphor-react-native';

import { db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { galleryCellWidth } from '@/utils/layout';
import { excludeTripShares } from '@/utils/posts';
import { contentKey, filterVisible } from '@/utils/moderation';
import { useModeration } from '@/hooks/useModeration';
import { useAuthStore } from '@/stores/useAuthStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface PostDoc {
  id: string;
  mediaUrl?: string;
  mediaType?: string;
  moderationHidden?: boolean;
}

async function fetchUserPosts(uid: string): Promise<PostDoc[]> {
  const q = query(
    collection(db, 'posts'),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(60),
  );
  const snap = await getDocs(q);
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PostDoc));
  return excludeTripShares(posts);
}

interface PostsGridProps {
  uid: string;
}

export function PostsGrid({ uid }: PostsGridProps) {
  const { colors } = useTheme();
  const { width, galleryColumns } = useLayout();
  const cell = galleryCellWidth(width, galleryColumns);

  const viewerUid = useAuthStore((s) => s.user?.uid ?? '');
  const moderation = useModeration();
  const { data: allPosts = [], isLoading } = useQuery({
    queryKey: ['userPosts', uid],
    queryFn: () => fetchUserPosts(uid),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
  // Your own grid shows everything, including posts moderation took down, so
  // nothing silently vanishes on you. Other people see the filtered grid.
  const posts = useMemo(
    () =>
      uid === viewerUid
        ? allPosts
        : filterVisible(allPosts, moderation, (p) => ({
            authorUid: uid,
            key: contentKey({ type: 'post', id: p.id }),
            moderationHidden: p.moderationHidden,
          })),
    [allPosts, moderation, uid, viewerUid],
  );

  if (isLoading) {
    return (
      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} width={cell} height={cell} radius={0} />
        ))}
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={SquaresFour}
        title="No posts to see yet"
        description="Travel moments they share will show up here."
      />
    );
  }

  return (
    <View style={styles.grid}>
      {posts.map((post) => (
        <TouchableOpacity
          key={post.id}
          style={{ width: cell, height: cell, backgroundColor: colors.background.sunken }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/post/${post.id}`);
          }}
          activeOpacity={0.85}
          accessibilityLabel="Open post"
        >
          {post.mediaUrl ? (
            <Image source={{ uri: post.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.fallback]}>
              <SquaresFour size={20} color={colors.text.disabled} weight="duotone" />
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
