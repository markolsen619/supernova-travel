import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedCard } from '@/components/feed/FeedCard';
import { useFeed } from '@/hooks/useFeed';
import { Post } from '@/types';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const SCREEN_HEIGHT = Dimensions.get('window').height;
type FeedTab = 'forYou' | 'following';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<FeedTab>('forYou');
  const [activeIndex, setActiveIndex] = useState(0);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useFeed(tab);

  const posts: Post[] = data?.pages.flatMap((p) => p.posts) ?? [];

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

  function handleEndReached() {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <View style={styles.container}>
      {/* Tab toggle */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity onPress={() => setTab('forYou')}>
          <Text style={[styles.headerTab, tab === 'forYou' && styles.headerTabActive]}>
            For You
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('following')}>
          <Text style={[styles.headerTab, tab === 'following' && styles.headerTabActive]}>
            Following
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DarkColors.brand.purple} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✈️</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            {tab === 'following' ? 'Follow travelers to see their posts here' : 'Be the first to share a travel moment'}
          </Text>
        </View>
      ) : (
        <FlashList
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
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={DarkColors.brand.purple} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing['6'],
    paddingBottom: Spacing['4'],
  },
  headerTab: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: 'rgba(255,255,255,0.5)',
  },
  headerTabActive: {
    color: '#fff',
    borderBottomWidth: 2,
    borderBottomColor: '#fff',
    paddingBottom: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['8'],
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  footerLoader: {
    padding: Spacing['5'],
    alignItems: 'center',
  },
});
