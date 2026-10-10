import React, { useRef } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DotsThree, SealCheck, Star } from 'phosphor-react-native';
import { Avatar } from '@/components/ui/Avatar';
import type { PlaceReview } from '@/hooks/usePlaceReviews';
import type { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type Colors = ReturnType<typeof useTheme>['colors'];

export function Stars({ rating, size = 14, color }: { rating: number; size?: number; color: string }) {
  return (
    <View style={styles.stars} accessibilityLabel={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={color} weight={n <= rating ? 'fill' : 'regular'} />
      ))}
    </View>
  );
}

interface ReviewCardProps {
  review: PlaceReview;
  colors: Colors;
  /** The place sheet shows a short version. */
  compact?: boolean;
  /** ⋯ — Report / Block for someone else's, Edit / Delete for yours. */
  onMore?: (review: PlaceReview, anchor: React.RefObject<View | null>) => void;
}

/** One traveler's review of a place (docs/superpowers/specs/2026-10-09-place-reviews-design.md). */
export function ReviewCard({ review, colors, compact, onMore }: ReviewCardProps) {
  const moreRef = useRef<View>(null);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar uri={review.authorAvatarUrl} name={review.authorName} size="xs" />
        <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{review.authorName}</Text>
        {review.visited && (
          <View style={styles.badge} accessibilityLabel="Visited on a trip">
            <SealCheck size={14} color={colors.brand.purple} weight="fill" />
            <Text style={[styles.badgeText, { color: colors.brand.purple }]}>Visited on a trip</Text>
          </View>
        )}
        {onMore && (
          <TouchableOpacity ref={moreRef} onPress={() => onMore(review, moreRef)} style={styles.more} hitSlop={8} accessibilityLabel="Review options">
            <DotsThree size={18} color={colors.text.tertiary} weight="bold" />
          </TouchableOpacity>
        )}
      </View>
      {review.rating ? <Stars rating={review.rating} color={colors.accent?.amber ?? '#E0A100'} /> : null}
      {!!review.text && (
        <Text style={[styles.text, { color: colors.text.secondary }]} numberOfLines={compact ? 3 : undefined}>{review.text}</Text>
      )}
      {review.photoUrls.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {review.photoUrls.map((u) => (
            <Image key={u} source={{ uri: u }} style={[compact ? styles.photoSmall : styles.photo, { backgroundColor: colors.background.sunken }]} accessibilityIgnoresInvertColors />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing['2'], paddingVertical: Spacing['3'] },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, flexShrink: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  badgeText: { fontSize: 12, fontWeight: FontWeight.medium },
  more: { marginLeft: 'auto', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  stars: { flexDirection: 'row', gap: 2 },
  text: { fontSize: 14, lineHeight: 20 },
  photos: { gap: Spacing['2'] },
  photo: { width: 120, height: 120, borderRadius: BorderRadius.md },
  photoSmall: { width: 64, height: 64, borderRadius: BorderRadius.sm },
});
