import React from 'react';
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
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing, Shadow } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { Avatar } from '@/components/ui/Avatar';
import { Trip, TripStatus } from '@/types';

interface TripCardProps {
  trip: Trip;
  onPress: () => void;
  style?: ViewStyle;
}

const STATUS_CONFIG: Record<TripStatus, { label: string; bg: string; text: string }> = {
  planning: { label: 'Planning', bg: 'rgba(251,191,36,0.2)', text: '#fbbf24' },
  active: { label: 'Active', bg: 'rgba(52,211,153,0.2)', text: '#34d399' },
  completed: { label: 'Completed', bg: 'rgba(96,165,250,0.2)', text: '#60a5fa' },
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

  return (
    <View style={[styles.shadowWrapper, style]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.wrapper}
      >
        {/* ── Cover image area ── */}
        <View style={styles.imageContainer}>
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
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusCfg.bg },
            ]}
          >
            <Text style={[styles.statusText, { color: statusCfg.text }]}>
              {statusCfg.label}
            </Text>
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
    ...Shadow.md,
  },
  wrapper: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  imageContainer: {
    height: 160,
    backgroundColor: 'rgba(167,139,250,0.15)',
  },
  statusBadge: {
    position: 'absolute',
    top: Spacing['2'],
    right: Spacing['2'],
    paddingHorizontal: Spacing['2'],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.3,
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
