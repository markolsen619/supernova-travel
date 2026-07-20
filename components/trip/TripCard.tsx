import React, { useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Timestamp } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { Avatar } from '@/components/ui/Avatar';
import { Trip, TripStatus } from '@/types';

interface TripCardProps {
  trip: Trip;
  onPress: () => void;
  style?: ViewStyle;
  /**
   * Destination-level photo to show when the trip has no cover of its own —
   * harvested by the caller from data already in memory (e.g. a sibling
   * trip's persisted coverImageUrl). Must never be resolved on render:
   * rendering a TripCard can never trigger a Places API call.
   */
  fallbackCoverUrl?: string | null;
}

// This badge sits on the raw cover photo, not app chrome — a light-tint-on-
// light-text pairing (the trip screen's colors.status tokens) assumes a
// plain canvas behind it and can't guarantee contrast against an arbitrary
// photo. Same "text over unpredictable media" problem as the feed overlay:
// solid dark scrim + white text, color-coded with a small dot instead of a
// tinted background.
const STATUS_LABELS: Record<TripStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
};

function formatDateRange(
  start: Timestamp | null,
  end: Timestamp | null,
): string {
  if (!start) return '';
  const fmt = (ts: Timestamp) =>
    ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export function TripCard({ trip, onPress, style, fallbackCoverUrl }: TripCardProps) {
  const { colors } = useTheme();
  const coverUrl = trip.coverImageUrl || fallbackCoverUrl || null;
  // Dot hues come from the shared accent/brand tokens (identical in both
  // themes) — the dot sits on the photo's dark scrim, so it needs the
  // bright variants, not the light-theme semantic tones.
  const statusDots: Record<TripStatus, string> = {
    planning: colors.accent.amber,
    active: colors.accent.teal,
    completed: colors.brand.blue,
  };
  // Saved-post records (feed bookmarks) omit status — a photo moment has no
  // planning lifecycle, so no badge at all beats a wrong one.
  const statusLabel = trip.status ? STATUS_LABELS[trip.status] ?? STATUS_LABELS.planning : null;
  const statusDot = trip.status ? statusDots[trip.status] ?? statusDots.planning : null;
  const dateRange = formatDateRange(trip.startDate, trip.endDate);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <View style={[styles.shadowWrapper, { shadowColor: colors.brand.purple }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.wrapper}
        accessibilityLabel={`Open trip to ${trip.destination.name}`}
      >
        {/* ── Cover image area ── */}
        <View style={[styles.imageContainer, { backgroundColor: colors.background.sunken }]}>
          {coverUrl ? (
            <>
              <Image
                source={{ uri: coverUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              {/* Bottom-up dark fade for text readability over the photo */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
            </>
          ) : (
            // Warm intentional placeholder — sunken tint + duotone mark, with
            // the destination name carried by the content area below.
            <View style={styles.placeholderCenter}>
              <MapPin size={28} color={colors.text.disabled} weight="duotone" />
            </View>
          )}

          {/* Status badge — top-right. Solid dark pill, not a tint: it must
              stay legible over bright and dark photos alike. */}
          {statusLabel && statusDot ? (
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: statusDot }]} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Content area ── */}
        <View style={[styles.contentArea, { backgroundColor: colors.background.card }]}>
          {/* Destination */}
          <Text
            style={[styles.destination, { color: colors.text.primary }]}
            numberOfLines={1}
          >
            {trip.destination.name}
          </Text>

          {/* Date range */}
          {dateRange ? (
            <Text style={[styles.dateRange, { color: colors.text.secondary }]}>
              {dateRange}
            </Text>
          ) : null}

          {/* Author row */}
          <View style={styles.authorRow}>
            <Avatar size="xs" />
            <Text style={[styles.authorText, { color: colors.text.tertiary }]}>
              by traveler
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    borderRadius: BorderRadius.xl,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  wrapper: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  imageContainer: {
    height: 160,
  },
  placeholderCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: Spacing['2'],
    right: Spacing['2'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Spacing['2'],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.3,
    color: '#fff',
  },
  contentArea: {
    padding: Spacing['3'],
  },
  destination: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  dateRange: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    marginBottom: Spacing['2'],
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
  },
  authorText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
  },
});
