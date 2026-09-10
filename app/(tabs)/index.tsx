import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Heart, AirplaneTilt } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { FeedCard } from '@/components/feed/FeedCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { useFeed } from '@/hooks/useFeed';
import { useTheme } from '@/hooks/useTheme';
import { useHasUnreadActivity } from '@/hooks/useUnreadActivity';
import { useLayout } from '@/hooks/useLayout';
import { useDimensionChange } from '@/hooks/useDimensionChange';
import { Post } from '@/types';
import { Spacing } from '@/constants/spacing';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { width, height } = useLayout();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlashListRef<Post>>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useFeed('forYou');
  const { data: hasUnread = false } = useHasUnreadActivity();

  const posts: Post[] = data?.pages.flatMap((p) => p.posts) ?? [];
  // The fixed header sits on top of whatever's behind it — almost always a
  // photo/video card, but not during loading/empty. Its dark scrim (needed
  // for the white icons to read over arbitrary media) only makes sense when
  // there's actually a card behind it; over the light empty/loading canvas
  // it would just be a stray dark bar.
  const hasContent = !isLoading && posts.length > 0;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
  });

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null; isViewable: boolean }> }) => {
      const first = viewableItems.find((v) => v.isViewable);
      if (first) setActiveIndex(first.index ?? 0);
    },
    []
  );

  // A resize changes the page size, so the list's stored offset now points
  // somewhere else — unfold while reading post 7 and you land between two
  // others. Rather than assume one frame is enough for FlashList to
  // recompute its layout — it recomputes asynchronously, and a scroll issued
  // too early lands on the wrong post — record the intent here and perform
  // it when the list reports its new layout.
  // Video continuity comes free: isActive is derived from activeIndex.
  const pendingRestoreRef = useRef<number | null>(null);

  useDimensionChange(() => {
    if (activeIndex <= 0) return;
    pendingRestoreRef.current = activeIndex;
  });

  const handleListLayout = useCallback(() => {
    const index = pendingRestoreRef.current;
    if (index == null) return;
    pendingRestoreRef.current = null;
    // One frame inside the layout callback, so the scroll runs after this
    // layout pass has committed rather than during it.
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false });
    });
  }, []);

  function handleEndReached() {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  const handleAddPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/add-to-feed');
  }, [router]);

  const handleNotificationsPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/notifications');
  }, [router]);

  return (
    <ScreenEntrance>
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header — bare white icons straight on the photo (the header's own
          scrim keeps them legible over bright media); over the light
          empty/loading canvas the scrim is absent, so they flip to dark.
          Touch targets stay 44pt via the wrapper even without the circles. */}
      <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
        {hasContent && (
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleAddPress}
          activeOpacity={0.7}
          hitSlop={6}
          accessibilityLabel="Share a moment"
        >
          <Plus size={24} color={hasContent ? '#fff' : colors.text.primary} weight="bold" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Image
            source={require('@/assets/images/SupernovaLogo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleNotificationsPress}
          activeOpacity={0.7}
          hitSlop={6}
          accessibilityLabel="Notifications"
        >
          <View>
            <Heart size={24} color={hasContent ? '#fff' : colors.text.primary} weight="bold" />
            {hasUnread && <View style={styles.unreadBadge} />}
          </View>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <SkeletonCard width={width} height={height} radius={0} />
      ) : posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={AirplaneTilt}
            title="Your feed starts here"
            description="Follow travelers or share your first moment."
            actionLabel="Share a moment"
            onAction={handleAddPress}
            actionHaptic="none"
          />
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <FeedCard post={item} isActive={index === activeIndex} />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          viewabilityConfig={viewabilityConfig.current}
          onViewableItemsChanged={onViewableItemsChanged}
          onLayout={handleListLayout}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.brand.purple} />
              </View>
            ) : null
          }
        />
      )}
    </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerLogo: {
    width: '100%',
    height: 97,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoader: {
    padding: Spacing['5'],
    alignItems: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#f472b6',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.3)',
  },
});
