import React, { useCallback, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, CaretRight, PencilSimpleLine } from 'phosphor-react-native';
import { usePlaceReviews, usePlaceStats, useMyReview } from '@/hooks/usePlaceReviews';
import { useModeration } from '@/hooks/useModeration';
import { filterVisible, contentKey } from '@/utils/moderation';
import { ratingLine, topReviews } from '@/utils/placeReviews';
import { ReviewCard, Stars } from '@/components/places/ReviewCard';
import type { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type Colors = ReturnType<typeof useTheme>['colors'];

interface Props {
  placeId: string;
  placeName: string;
  colors: Colors;
  /** Opened from a trip stop: the review buttons are the sheet's second row, not links. */
  fromTrip: boolean;
}

/**
 * "FROM SUPERNOVA TRAVELERS" on the place sheet: rating, newest photos, the top
 * review, See all — plus Add photos / Write a review. Kept short: the sheet is
 * a fixed panel, the full list is its own screen (app/place/reviews.tsx).
 */
export function PlaceReviewsSummary({ placeId, placeName, colors, fromTrip }: Props) {
  const { data: stats } = usePlaceStats(placeId);
  const { data: reviews = [] } = usePlaceReviews(placeId);
  const { data: mine } = useMyReview(placeId);
  const moderation = useModeration();
  const visible = useMemo(
    () => filterVisible(reviews, moderation, (r) => ({ authorUid: r.authorUid, key: contentKey({ type: 'review', id: r.id }), moderationHidden: r.moderationHidden })),
    [reviews, moderation],
  );
  const top = topReviews(visible, 1)[0];
  const line = stats ? ratingLine(stats) : '';
  const average = stats && stats.ratingCount > 0 ? Math.round(stats.ratingSum / stats.ratingCount) : 0;

  const go = useCallback((path: 'review' | 'reviews', focus?: 'photos') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const q = new URLSearchParams({ placeId, placeName, ...(focus ? { focus } : {}) }).toString();
    router.push(`/place/${path}?${q}` as Href);
  }, [placeId, placeName]);

  const writeLabel = mine ? 'Edit your review' : 'Write a review';
  return (
    <View style={[styles.wrap, { borderColor: colors.background.cardBorder }]}>
      <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>FROM SUPERNOVA TRAVELERS</Text>
      {line ? (
        <TouchableOpacity onPress={() => go('reviews')} style={styles.ratingRow} accessibilityRole="link" accessibilityLabel={`${line}. See all reviews`}>
          {average > 0 && <Stars rating={average} color={colors.accent.amber} />}
          <Text style={[styles.rating, { color: colors.text.primary }]}>{line}</Text>
          <Text style={[styles.seeAll, { color: colors.text.secondary }]}>See all</Text>
          <CaretRight size={14} color={colors.text.secondary} weight="bold" />
        </TouchableOpacity>
      ) : (
        <Text style={[styles.empty, { color: colors.text.secondary }]}>Be the first to review {placeName}.</Text>
      )}
      {stats && stats.latestPhotos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {stats.latestPhotos.slice(0, 8).map((p) => (
            <Image key={p.url} source={{ uri: p.url }} style={[styles.photo, { backgroundColor: colors.background.sunken }]} accessibilityIgnoresInvertColors />
          ))}
        </ScrollView>
      )}
      {top && <ReviewCard review={top} colors={colors} compact />}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => go('review', 'photos')}
          style={[fromTrip ? styles.button : styles.link, fromTrip && { borderColor: colors.background.cardBorder }]}
          accessibilityRole="button"
        >
          <Camera size={16} color={colors.text.primary} weight="bold" />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>Add photos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => go('review')}
          style={[fromTrip ? styles.button : styles.link, fromTrip && { borderColor: colors.background.cardBorder }]}
          accessibilityRole="button"
        >
          <PencilSimpleLine size={16} color={colors.text.primary} weight="bold" />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>{writeLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing['3'], marginTop: Spacing['2'], gap: Spacing['2'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 32 },
  rating: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  seeAll: { marginLeft: 'auto', fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  empty: { fontSize: 14 },
  photos: { gap: Spacing['2'] },
  photo: { width: 64, height: 64, borderRadius: BorderRadius.sm },
  actions: { flexDirection: 'row', gap: Spacing['2'] },
  button: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'],
    minHeight: 44, borderRadius: BorderRadius.full, borderWidth: 1,
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44, paddingRight: Spacing['3'] },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
