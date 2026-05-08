import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { PencilSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { TripActivity } from '@/types';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';

interface ActivityItemProps {
  activity: TripActivity;
  onPress?: () => void;
  onEdit?: () => void;
  showEdit?: boolean;
}

export function ActivityItem({
  activity,
  onPress,
  onEdit,
  showEdit = false,
}: ActivityItemProps) {
  const { colors } = useTheme();
  const { Icon, color: accentColor } = ACTIVITY_ICONS[activity.type];
  const subtitle = activity.address ?? activity.notes ?? '';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress}
      style={styles.container}
    >
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

        {/* Icon bubble */}
        <View style={styles.iconWrapper}>
          <TypeIconBubble Icon={Icon} color={accentColor} bubbleSize={36} iconSize={20} />
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
            <PencilSimple size={14} color={colors.text.tertiary} weight="regular" />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {},
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
  iconWrapper: {
    marginRight: Spacing['2'],
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
});
