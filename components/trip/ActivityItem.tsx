import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { ActivityType, TripActivity } from '@/types';

interface ActivityItemProps {
  activity: TripActivity;
  onPress?: () => void;
  onEdit?: () => void;
  showEdit?: boolean;
}

const TYPE_EMOJI: Record<ActivityType, string> = {
  flight: '✈️',
  hotel: '🏨',
  restaurant: '🍽️',
  activity: '🎯',
  transport: '🚌',
  free: '⬜',
};

// Left-border accent and icon pill colors per activity type
const TYPE_ACCENT: Record<ActivityType, string> = {
  flight: '#60a5fa',      // blue
  hotel: '#a78bfa',       // purple
  restaurant: '#f472b6',  // pink
  activity: '#34d399',    // teal
  transport: '#fbbf24',   // amber
  free: '#6b7280',        // gray
};

export function ActivityItem({
  activity,
  onPress,
  onEdit,
  showEdit = false,
}: ActivityItemProps) {
  const { colors } = useTheme();
  const accentColor = TYPE_ACCENT[activity.type];
  const emoji = TYPE_EMOJI[activity.type];
  const subtitle = activity.address ?? activity.notes ?? '';

  const inner = (
    <View style={[styles.row, { backgroundColor: colors.background.card }]}>
      {/* Left border accent */}
      <View style={[styles.accentBorder, { backgroundColor: accentColor }]} />

      {/* Time column */}
      <View style={styles.timeCol}>
        {activity.startTime ? (
          <Text style={[styles.timeText, { color: colors.text.secondary }]}>
            {activity.startTime}
          </Text>
        ) : (
          <View style={[styles.typeDot, { backgroundColor: accentColor }]} />
        )}
      </View>

      {/* Icon pill */}
      <View
        style={[
          styles.iconPill,
          { backgroundColor: `${accentColor}26` }, // ~15% opacity
        ]}
      >
        <Text style={styles.iconEmoji}>{emoji}</Text>
      </View>

      {/* Content */}
      <View style={styles.contentCol}>
        <Text
          style={[styles.title, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {activity.title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, { color: colors.text.tertiary }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Edit button */}
      {showEdit && onEdit ? (
        <TouchableOpacity
          onPress={onEdit}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.editBtn}
        >
          <Text style={[styles.editIcon, { color: colors.text.tertiary }]}>✏️</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    minHeight: 52,
  },
  accentBorder: {
    width: 3,
    alignSelf: 'stretch',
  },
  timeCol: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['2'],
  },
  timeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing['2'],
  },
  iconEmoji: {
    fontSize: 18,
  },
  contentCol: {
    flex: 1,
    paddingVertical: Spacing['2'],
    paddingRight: Spacing['2'],
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
  },
  editBtn: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  editIcon: {
    fontSize: 14,
  },
});
