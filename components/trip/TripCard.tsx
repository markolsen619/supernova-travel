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
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { Avatar } from '@/components/ui/Avatar';
import { Trip, TripStatus } from '@/types';

interface TripCardProps {
  trip: Trip;
  onPress: () => void;
  style?: ViewStyle;
}

// This badge sits on the raw cover photo, not app chrome — a light-tint-on-
// light-text pairing (the trip screen's colors.status tokens) assumes a
// plain canvas behind it and can't guarantee contrast against an arbitrary
// photo. Same "text over unpredictable media" problem as the feed overlay:
// solid dark scrim + white text, color-coded with a small dot instead of a
// tinted background.
const STATUS_CONFIG: Record<TripStatus, { label: string; dot: string }> = {
  planning: { label: 'Planning', dot: '#fbbf24' },
  active: { label: 'Active', dot: '#34d399' },
  completed: { label: 'Completed', dot: '#60a5fa' },
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

export function TripCard({ trip, onPress, style }: TripCardProps) {
  const { colors } = useTheme();
  const statusCfg = STATUS_CONFIG[trip.status] ?? STATUS_CONFIG.planning;
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
          {trip.coverImageUrl ? (
            <Image
              source={{ uri: trip.coverImageUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={colors.gradient.card}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Bottom-up dark fade for text readability */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          {/* Status badge — top-right */}
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusCfg.dot }]} />
            <Text style={styles.statusText}>{statusCfg.label}</Text>
          </View>
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
