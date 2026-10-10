import { useCallback, useMemo } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, ChatsCircle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReviewCard } from '@/components/places/ReviewCard';
import { usePlaceReviewActions, usePlaceReviews, usePlaceStats, type PlaceReview } from '@/hooks/usePlaceReviews';
import { useModeration } from '@/hooks/useModeration';
import { useContentActions } from '@/components/moderation/useContentActions';
import { useAuthStore } from '@/stores/useAuthStore';
import { contentKey, filterVisible } from '@/utils/moderation';
import { ratingLine, topReviews } from '@/utils/placeReviews';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

/** Every traveler's review of a place, visitors first (docs/superpowers/specs/2026-10-09-place-reviews-design.md). */
export default function PlaceReviewsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { placeId, placeName } = useLocalSearchParams<{ placeId: string; placeName: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: reviews = [] } = usePlaceReviews(placeId);
  const { data: stats } = usePlaceStats(placeId);
  const { remove } = usePlaceReviewActions();
  const moderation = useModeration();
  const { openActions, reportSheet } = useContentActions();

  const list = useMemo(
    () => topReviews(
      filterVisible(reviews, moderation, (r) => ({ authorUid: r.authorUid, key: contentKey({ type: 'review', id: r.id }), moderationHidden: r.moderationHidden })),
      reviews.length,
    ),
    [reviews, moderation],
  );

  const writeReview = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/place/review?${new URLSearchParams({ placeId: placeId ?? '', placeName: placeName ?? '' })}` as Href);
  }, [placeId, placeName]);

  const onMore = useCallback((review: PlaceReview, anchor: React.RefObject<View | null>) => {
    if (review.authorUid === uid) {
      Alert.alert('Your review', undefined, [
        { text: 'Edit', onPress: writeReview },
        { text: 'Delete', style: 'destructive', onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); remove(review); } },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    openActions({ target: { type: 'review', id: review.id, ownerUid: review.authorUid }, ownerName: review.authorName, anchor: anchor as never });
  }, [uid, writeReview, remove, openActions]);

  const back = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity onPress={back} style={styles.back} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{stats ? ratingLine(stats).toUpperCase() : 'REVIEWS'}</Text>
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>{placeName}</Text>
        </View>
        <TouchableOpacity onPress={writeReview} style={styles.write} accessibilityRole="button">
          <Text style={[styles.writeText, { color: colors.text.primary }]}>Write a review</Text>
        </TouchableOpacity>
      </View>
      {list.length === 0 ? (
        <EmptyState
          icon={ChatsCircle}
          title={`Be the first to review ${placeName}`}
          description="Tell other travelers what it was like, and add your photos."
          actionLabel="Write a review"
          onAction={writeReview}
          actionHaptic="light"
        />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <ReviewCard review={item} colors={colors} onMore={onMore} />}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.background.cardBorder }]} />}
          contentContainerStyle={{ paddingHorizontal: Spacing['5'], paddingBottom: insets.bottom + Spacing['6'] }}
        />
      )}
      {reportSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['3'], paddingHorizontal: Spacing['5'], paddingBottom: Spacing['3'] },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -Spacing['2'] },
  headerText: { flex: 1, gap: 4, paddingTop: Spacing['2'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: 24, fontWeight: FontWeight.semiBold, letterSpacing: -0.4 },
  write: { minHeight: 44, justifyContent: 'center' },
  writeText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  sep: { height: StyleSheet.hairlineWidth },
});
