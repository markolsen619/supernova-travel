import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { Trip, TripStatus } from '@/types';

interface TripResultProps {
  trip: Trip;
  onPress: () => void;
}

export function TripResult({ trip, onPress }: TripResultProps) {
  const { colors } = useTheme();

  const STATUS_CONFIG: Record<TripStatus, { label: string; bg: string; text: string }> = {
    planning:  { label: 'Planning',  bg: colors.accent.amber + '33', text: colors.accent.amber },
    active:    { label: 'Active',    bg: colors.accent.teal + '33',  text: colors.accent.teal },
    completed: { label: 'Completed', bg: colors.brand.blue + '33',   text: colors.brand.blue },
  };

  const statusCfg = STATUS_CONFIG[trip.status] ?? STATUS_CONFIG.planning;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}
    >
      {/* Thumbnail */}
      <View style={[styles.thumbnail, { backgroundColor: colors.brand.purple + '26' }]}>
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
      </View>

      {/* Text */}
      <View style={styles.center}>
        <Text
          style={[styles.title, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {trip.title}
        </Text>
        <Text
          style={[styles.destination, { color: colors.text.tertiary }]}
          numberOfLines={1}
        >
          {trip.destination.name}
        </Text>
      </View>

      {/* Status badge */}
      <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
        <Text style={[styles.badgeText, { color: statusCfg.text }]}>
          {statusCfg.label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing['3'],
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    flexShrink: 0,
  },
  center: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  destination: {
    fontSize: FontSize.sm,
  },
  badge: {
    paddingHorizontal: Spacing['2'],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
});
