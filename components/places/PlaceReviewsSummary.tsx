import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, CaretRight, PencilSimpleLine } from 'phosphor-react-native';
import { usePlaceStats, useMyReview } from '@/hooks/usePlaceReviews';
import { ratingLine } from '@/utils/placeReviews';
import { Stars } from '@/components/places/ReviewCard';
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
 * "FROM SUPERNOVA TRAVELERS" on the place sheet — deliberately one line: the
 * rating (→ every review, with photos, on app/place/reviews.tsx) and Add photos /
 * Write a review. The sheet is a fixed panel that can't scroll; photos and the
 * reviews themselves made it taller than the screen.
 */
export function PlaceReviewsSummary({ placeId, placeName, colors, fromTrip }: Props) {
  const { data: stats } = usePlaceStats(placeId);
  const { data: mine } = useMyReview(placeId);
  const line = stats ? ratingLine(stats) : '';
  const average = stats && stats.ratingCount > 0 ? Math.round(stats.ratingSum / stats.ratingCount) : 0;

  const go = useCallback((path: 'review' | 'reviews', focus?: 'photos') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const q = new URLSearchParams({ placeId, placeName, ...(focus ? { focus } : {}) }).toString();
    router.push(`/place/${path}?${q}` as Href);
  }, [placeId, placeName]);

  return (
    <View style={[styles.wrap, { borderColor: colors.background.cardBorder }]}>
      <TouchableOpacity onPress={() => go('reviews')} style={styles.ratingRow} accessibilityRole="link"
        accessibilityLabel={line ? `${line}. See reviews and photos` : 'No reviews yet. See reviews'}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>TRAVELERS</Text>
        {average > 0 && <Stars rating={average} size={12} color={colors.accent.amber} />}
        <Text style={[styles.rating, { color: line ? colors.text.primary : colors.text.secondary }]} numberOfLines={1}>
          {line || 'No reviews yet'}
        </Text>
        <CaretRight size={14} color={colors.text.secondary} weight="bold" style={styles.caret} />
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => go('review', 'photos')}
          style={[fromTrip ? styles.button : styles.link, fromTrip && { borderColor: colors.background.cardBorder }]} accessibilityRole="button">
          <Camera size={16} color={colors.text.primary} weight="bold" />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>Add photos</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => go('review')}
          style={[fromTrip ? styles.button : styles.link, fromTrip && { borderColor: colors.background.cardBorder }]} accessibilityRole="button">
          <PencilSimpleLine size={16} color={colors.text.primary} weight="bold" />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>{mine ? 'Edit your review' : 'Write a review'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing['2'], marginTop: Spacing['2'], gap: Spacing['1'] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  rating: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, flexShrink: 1 },
  caret: { marginLeft: 'auto' },
  actions: { flexDirection: 'row', gap: Spacing['2'] },
  button: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'],
    minHeight: 44, borderRadius: BorderRadius.full, borderWidth: 1,
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44, paddingRight: Spacing['3'] },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
