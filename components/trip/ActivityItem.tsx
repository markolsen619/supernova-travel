import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { PencilSimple, MapPinLine } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { TripActivity } from '@/types';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { StopStateBubble } from '@/components/trip/StopStateBubble';

interface ActivityItemProps {
  activity: TripActivity;
  onPress?: () => void;
  onEdit?: () => void;
  /** Long-press to pick up this row for drag-to-reorder (see DayTimeline). */
  onLongPress?: () => void;
  /** Tap the icon bubble to toggle visited (TM-2b) — omit for viewers. */
  onToggleVisited?: () => void;
  showEdit?: boolean;
  /** True while this specific activity's AI stop is being lazily grounded. */
  isResolving?: boolean;
  /** True while this row is the one currently being dragged. */
  isDragging?: boolean;
  /** True briefly after arriving here via "View in timeline" from the map. */
  isHighlighted?: boolean;
  /** The trip's next not-yet-visited stop, in day/order sequence — "you are here". */
  isCurrent?: boolean;
}

export function ActivityItem({
  activity,
  onPress,
  onEdit,
  onLongPress,
  onToggleVisited,
  showEdit = false,
  isResolving = false,
  isDragging = false,
  isHighlighted = false,
  isCurrent = false,
}: ActivityItemProps) {
  const { colors } = useTheme();
  const { Icon, color: accentColor } = ACTIVITY_ICONS[activity.type];
  // An AI-generated stop not yet resolved to a real place — tapping it
  // triggers lazy grounding (see trip/[id].tsx). Grounded means "has
  // coordinates", not "has a Google placeId": a Mapbox-grounded stop carries
  // lat/lng with no placeId and must not still read as ungrounded here
  // (mirrors TripMapView's collectStops predicate). Only hinted when onPress
  // is actually wired: DayTimeline only passes onActivityPress for the trip
  // owner (Firestore only allows the persisting write for owner/collaborator),
  // so a viewer never sees an affordance that would silently fail on tap.
  const isUngrounded = (activity.lat == null || activity.lng == null) && !!activity.searchQuery && !!onPress;
  const subtitle = isResolving
    ? 'Finding on map…'
    : isUngrounded
      ? 'Tap to find on map'
      : (activity.address ?? activity.notes ?? '');

  // Both branches this can lead to (ground-in-place, jump-to-map-pin) read
  // as selection/navigation, not a write the user is consciously making —
  // Light per the haptics rule. Found unwired during this pass's audit.
  const handlePress = useCallback(() => {
    if (!onPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  const handleEdit = useCallback(() => {
    if (!onEdit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEdit();
  }, [onEdit]);

  // A write the user is consciously making, not just navigating — Medium,
  // matching every other persisted toggle in the app.
  const handleToggleVisited = onToggleVisited
    ? () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onToggleVisited();
      }
    : undefined;

  return (
    <TouchableOpacity
      onPress={onPress ? handlePress : undefined}
      onLongPress={onLongPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress || isResolving}
      style={[styles.container, isDragging && styles.dragging]}
    >
      <View
        style={[
          styles.row,
          { backgroundColor: colors.background.card },
          isHighlighted && { backgroundColor: `${colors.brand.purple}1F`, borderWidth: 1, borderColor: colors.brand.purple },
        ]}
      >
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

        {/* Icon bubble doubles as the visited toggle when editable — see
            StopStateBubble for the three states (planned/current/visited),
            shared with the map's selected-stop card. */}
        <View style={styles.iconWrapper}>
          <StopStateBubble
            Icon={Icon}
            color={accentColor}
            visited={activity.visited}
            isCurrent={isCurrent}
            onToggle={handleToggleVisited}
            surfaceColor={colors.background.card}
          />
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
            <View style={styles.subtitleRow}>
              {isUngrounded && !isResolving ? (
                <MapPinLine size={11} color={colors.brand.purple} weight="bold" />
              ) : null}
              <Text
                style={[
                  styles.subtitle,
                  { color: isUngrounded ? colors.brand.purple : colors.text.tertiary },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Resolving spinner / edit button */}
        {isResolving ? (
          <View style={styles.editBtn}>
            <ActivityIndicator size="small" color={colors.brand.purple} />
          </View>
        ) : showEdit && onEdit ? (
          <TouchableOpacity
            onPress={handleEdit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.editBtn}
            accessibilityLabel="Edit activity"
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
  dragging: {
    opacity: 0.85,
    transform: [{ scale: 1.02 }],
  },
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
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
    flexShrink: 1,
  },
  editBtn: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
});
