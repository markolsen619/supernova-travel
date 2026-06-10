import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Heart } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { FeedCard } from '@/components/feed/FeedCard';
import { useFeed } from '@/hooks/useFeed';
import { Post } from '@/types';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

function overrideItemLayout(layout: { size: number }) {
  layout.size = SCREEN_HEIGHT;
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useFeed('forYou');

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
      {/* Header */}
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'transparent'] as [string, string]}
        style={[styles.header, { paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/add-to-feed'); }}
          activeOpacity={0.7}
        >
          <Plus size={26} color="rgba(255,255,255,0.92)" weight="regular" />
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
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/notifications'); }}
          activeOpacity={0.7}
        >
          <Heart size={26} color="rgba(255,255,255,0.92)" weight="regular" />
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
          <Text style={styles.emptySubtitle}>Be the first to share a travel moment</Text>
        </View>
      ) : (
        <FlashList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <FeedCard post={item} isActive={index === activeIndex} />
          )}
          pagingEnabled
          estimatedItemSize={SCREEN_HEIGHT}
          overrideItemLayout={overrideItemLayout}
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
