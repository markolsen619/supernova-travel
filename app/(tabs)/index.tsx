import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useNavigation, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Heart, AirplaneTilt } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { FeedCard } from '@/components/feed/FeedCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { useFeed } from '@/hooks/useFeed';
import { useModeration } from '@/hooks/useModeration';
import { useContentActions } from '@/components/moderation/useContentActions';
import { contentKey, filterVisible } from '@/utils/moderation';
import { useTheme } from '@/hooks/useTheme';
import { useHasUnreadActivity } from '@/hooks/useUnreadActivity';
import { useLayout } from '@/hooks/useLayout';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useDimensionChange } from '@/hooks/useDimensionChange';
import { Post } from '@/types';
import { FeedTripCard } from '@/components/feed/FeedTripCard';
import { TravelerSuggestionsPage } from '@/components/feed/TravelerSuggestionsPage';
import { useFeedTrips } from '@/hooks/useFeedTrips';
import { useTravelerSuggestions } from '@/hooks/useTravelerSuggestions';
import { mixFeed, type FeedItem } from '@/utils/feedMix';
import { shouldSuggest } from '@/utils/travelerSuggestions';
import { Spacing } from '@/constants/spacing';
import { useIsOnline } from '@/services/offline';
import { OfflineEmptyState } from '@/components/ui/OfflineEmptyState';
const feedItemKey = (item: FeedItem<Post>) => (item.kind === 'post' ? `post:${item.post.id}` : item.kind === 'trip' ? `trip:${item.trip.id}` : 'suggestions');

export default function FeedScreen() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { height, feedWidth, isLarge } = useLayout();
  const [activeIndex, setActiveIndex] = useState(0);
  // The page on screen by its key, not its position: trip cards and the suggestions page can be inserted above it
  // as they load, which would otherwise hand "active" (video playback) to a neighbour.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Off-screen (the post screen on top, another tab) no clip plays: the feed kept playing under them.
  const screenFocused = useIsFocused();
  const listRef = useRef<FlashListRef<FeedItem<Post>>>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useFeed('forYou');

  // Tapping Feed while already on it: back to the top, with the newest posts.
  // resetQueries drops the loaded pages so the first page is fetched fresh
  // (a plain refetch would re-run every page the list has scrolled through).
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  useEffect(() => {
    return navigation.addListener('tabPress' as never, () => {
      if (!navigation.isFocused()) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      setActiveIndex(0);
      setActiveKey(null);
      queryClient.resetQueries({ queryKey: ['feed'] });
      // A tap on Feed is the "next feed load" the suggestions page waits for (spec 2026-10-24).
      queryClient.invalidateQueries({ queryKey: ['travelerSuggestions'] });
    });
  }, [navigation, queryClient]);
  const { data: hasUnread = false } = useHasUnreadActivity();

  const moderation = useModeration();
  const { openActions, reportSheet } = useContentActions();
  const posts: Post[] = useMemo(
    () =>
      filterVisible(data?.pages.flatMap((p) => p.posts) ?? [], moderation, (post) => ({
        authorUid: post.authorUid,
        key: contentKey({ type: 'post', id: post.id }),
        moderationHidden: post.moderationHidden,
      })),
    [data, moderation],
  );

  // A post's authorDisplayName/authorAvatarUrl are frozen at creation time,
  // so anyone who posted before setting a profile photo — or who has changed
  // it since — shows stale initials here while their profile screen shows the
  // real thing. One batched `in` query per 30 distinct authors keeps these
  // honest; the same hook TripCard already uses for exactly this.
  // Trip cards after every 3 posts and once posts run out; "Travelers to follow" while you follow few
  // (spec 2026-10-24-seed-social-design.md).
  const feedTrips = useFeedTrips();
  const { suggestions, followingCount, isLoading: suggestionsLoading } = useTravelerSuggestions();
  const items = useMemo(
    () => mixFeed(posts, feedTrips, { postsExhausted: !hasNextPage, showSuggestions: !suggestionsLoading && shouldSuggest(followingCount, suggestions.length) }),
    [posts, feedTrips, hasNextPage, followingCount, suggestions.length, suggestionsLoading],
  );

  const authorUids = useMemo(
    () => [...posts.map((p) => p.authorUid), ...feedTrips.filter((t) => !t.isEditorial).map((t) => t.authorUid)],
    [posts, feedTrips],
  );
  const { data: authorProfiles = {} } = useAuthorProfiles(authorUids);

  const handleMorePress = useCallback(
    (post: Post, anchor: React.RefObject<View | null>) => {
      openActions({
        target: { type: 'post', id: post.id, ownerUid: post.authorUid },
        ownerName: post.authorDisplayName || 'this traveler',
        anchor,
      });
    },
    [openActions],
  );
  // The fixed header sits on top of whatever's behind it — almost always a
  // photo/video card, but not during loading/empty. Its dark scrim (needed
  // for the white icons to read over arbitrary media) only makes sense when
  // there's actually a card behind it; over the light empty/loading canvas
  // it would just be a stray dark bar.
  // White header icons over photo pages; theme colours over the suggestions page (light in light mode) and empty states.
  const onScreen = items.find((i) => feedItemKey(i) === activeKey) ?? items[0];
  const hasContent = !isLoading && items.length > 0 && onScreen?.kind !== 'suggestions';

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
  });

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null; isViewable: boolean; item?: FeedItem<Post> }[] }) => {
      const first = viewableItems.find((v) => v.isViewable);
      if (first) {
        setActiveIndex(first.index ?? 0);
        setActiveKey(first.item ? feedItemKey(first.item) : null);
      }
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

  // Offline (spec 2026-10-19 §3): nothing saved for this screen, so say so instead of spinning.
  if (!online && !data) return <OfflineEmptyState title="Connect to see the feed" description="Your trips and wallet still work offline." />;

  return (
    <ScreenEntrance>
    <View
      style={[
        styles.container,
        // The card is full-bleed on every size now (see feedColumnWidth), so
        // nothing of this surface shows behind it while there are posts. It
        // still backs the empty and loading states, which are light.
        { backgroundColor: colors.background.primary },
      ]}
    >
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
        <SkeletonCard width={feedWidth} height={height} radius={0} style={isLarge ? styles.centered : undefined} />
      ) : items.length === 0 ? (
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
        <View style={isLarge ? [styles.feedColumn, { width: feedWidth }] : styles.fill}>
        <FlashList
          ref={listRef}
          data={items}
          keyExtractor={feedItemKey}
          getItemType={(item) => item.kind}
          renderItem={({ item, index }) =>
            item.kind === 'post' ? (
              <FeedCard
                post={item.post}
                // Index-based, so a clip plays only while its own page is the one on screen.
                isActive={screenFocused && feedItemKey(item) === (activeKey ?? feedItemKey(items[0]))}
                author={authorProfiles[item.post.authorUid]}
                onMorePress={handleMorePress}
              />
            ) : item.kind === 'trip' ? (
              <FeedTripCard trip={item.trip} author={authorProfiles[item.trip.authorUid]} width={feedWidth} height={height} />
            ) : (
              <TravelerSuggestionsPage suggestions={suggestions} width={feedWidth} height={height} />
            )
          }
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
        </View>
      )}
      {reportSheet}
    </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  feedColumn: {
    flex: 1,
    alignSelf: 'center',
  },
  centered: {
    alignSelf: 'center',
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
