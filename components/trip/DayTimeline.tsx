import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Timestamp } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { NestableDraggableFlatList, RenderItemParams } from 'react-native-draggable-flatlist';
import { TrashSimple, NotePencil, MagnifyingGlass, MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { TripDay, TripActivity } from '@/types';
import { ActivityItem } from './ActivityItem';

interface DayTimelineProps {
  day: TripDay;
  onAddActivity?: () => void;
  /** Opens the place-search flow (Part B) to add a grounded stop to this day. */
  onAddStop?: () => void;
  onEditActivity?: (activity: TripActivity) => void;
  /** Fired when an activity row is tapped — used to lazily ground AI-generated stops. */
  onActivityPress?: (activity: TripActivity, dayId: string) => void;
  /** Fired once, on drop, with the full new order — never during the drag itself. */
  onReorderActivities?: (dayId: string, orderedActivities: TripActivity[]) => void;
  /** Owner-only: delete this whole day. */
  onDeleteDay?: () => void;
  /** Activity id currently being lazily resolved, if any. */
  resolvingActivityId?: string | null;
  editable?: boolean;
}

function formatDayHeader(dayNumber: number, date: Timestamp | null): string {
  const dayLabel = `Day ${dayNumber}`;
  if (!date) return dayLabel;
  const formatted = date.toDate().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${dayLabel} · ${formatted}`;
}

export function DayTimeline({
  day,
  onAddActivity,
  onAddStop,
  onEditActivity,
  onActivityPress,
  onReorderActivities,
  onDeleteDay,
  resolvingActivityId = null,
  editable = false,
}: DayTimelineProps) {
  const { colors } = useTheme();
  const handleEditActivity = useCallback(
    (activity: TripActivity) => onEditActivity?.(activity),
    [onEditActivity],
  );
  const handleActivityPress = useCallback(
    (activity: TripActivity) => onActivityPress?.(activity, day.id),
    [onActivityPress, day.id],
  );
  const sorted = [...day.activities].sort((a, b) => a.order - b.order);
  const hasActivities = sorted.length > 0;
  const hasNotes = Boolean(day.notes);
  const canDrag = editable && !!onReorderActivities && sorted.length > 1;

  const handleDragEnd = useCallback(
    ({ data }: { data: TripActivity[] }) => onReorderActivities?.(day.id, data),
    [onReorderActivities, day.id],
  );

  // "Add manually" only opens ActivityFormSheet — it doesn't write anything
  // itself, so Light (not Medium) per the haptics rule. Only used by the
  // non-empty "add actions" row below; the empty state's own secondary link
  // fires this via EmptyState's built-in Light haptic instead.
  const handleAddManually = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddActivity?.();
  }, [onAddActivity]);

  // Destructive-confirm — this tap is what triggers the delete Alert in the
  // parent, so it gets the haptic, not the native Alert's own buttons (no
  // hook into those). Found unwired during this pass's haptics audit.
  const handleDeleteDay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDeleteDay?.();
  }, [onDeleteDay]);

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<TripActivity>) => {
      const index = getIndex() ?? 0;
      const isLast = index === sorted.length - 1;
      return (
        <View>
          <ActivityItem
            activity={item}
            onPress={onActivityPress ? () => handleActivityPress(item) : undefined}
            onEdit={onEditActivity ? () => handleEditActivity(item) : undefined}
            onLongPress={canDrag ? drag : undefined}
            showEdit={editable}
            isResolving={resolvingActivityId === item.id}
            isDragging={isActive}
          />
          {!isLast && (
            <View style={[styles.connector, { backgroundColor: colors.background.cardBorder }]} />
          )}
        </View>
      );
    },
    [
      sorted.length,
      onActivityPress,
      handleActivityPress,
      onEditActivity,
      handleEditActivity,
      canDrag,
      editable,
      resolvingActivityId,
      colors.background.cardBorder,
    ],
  );

  return (
    <View style={styles.container}>
      {/* ── Day header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.dayNumber, { color: colors.brand.purple }]}>
            {String(day.dayNumber).padStart(2, '0')}
          </Text>
          <View style={styles.headerText}>
            <Text style={[styles.headerDate, { color: colors.text.primary }]}>
              {formatDayHeader(day.dayNumber, day.date)}
            </Text>
            {day.title ? (
              <Text
                style={[styles.headerTitle, { color: colors.text.secondary }]}
                numberOfLines={1}
              >
                {day.title}
              </Text>
            ) : null}
          </View>
        </View>
        {hasNotes && (
          <NotePencil size={15} color={colors.text.tertiary} weight="regular" />
        )}
        {editable && onDeleteDay ? (
          // 24×24 visual box (16px icon + 4px padding) + hitSlop 12 clears the
          // 44pt floor (48×48); the old hitSlop of 8 landed at 40×40, short of it.
          <TouchableOpacity onPress={handleDeleteDay} hitSlop={12} style={styles.deleteDayBtn} accessibilityLabel="Delete day">
            <TrashSimple size={16} color={colors.text.tertiary} weight="regular" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Activities ── */}
      {hasActivities ? (
        <NestableDraggableFlatList
          data={sorted}
          keyExtractor={(activity) => activity.id}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
          containerStyle={styles.activitiesContainer}
        />
      ) : (
        <EmptyState
          icon={MapPin}
          title="No stops yet"
          description="Add a place you want to visit."
          actionLabel="Find a place"
          onAction={editable ? onAddStop : undefined}
          actionIcon={MagnifyingGlass}
          actionHaptic="light"
          secondaryLabel="Add manually"
          onSecondary={editable ? onAddActivity : undefined}
          size="sm"
        />
      )}

      {/* ── Add actions (day already has stops) ── */}
      {editable && hasActivities && (onAddStop || onAddActivity) && (
        <View style={styles.addActionsRow}>
          {onAddStop && (
            <Button
              label="Find a place"
              onPress={onAddStop}
              icon={MagnifyingGlass}
              variant="primary"
              size="sm"
              haptic="light"
            />
          )}
          {onAddActivity && (
            <TouchableOpacity onPress={handleAddManually} hitSlop={8} style={styles.textLinkBtn}>
              <Text style={[styles.textLink, { color: colors.text.secondary }]}>Add manually</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing['3'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
    gap: Spacing['3'],
  },
  dayNumber: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.2,
  },
  headerText: {
    flex: 1,
  },
  headerDate: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    marginTop: 1,
  },
  deleteDayBtn: {
    padding: Spacing['1'],
  },
  activitiesContainer: {
    gap: 0,
  },
  connector: {
    height: 0.5,
    marginLeft: 47, // align under the icon column
  },

  addActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['4'],
    marginTop: Spacing['1'],
  },
  textLinkBtn: {
    paddingVertical: Spacing['2'],
  },
  textLink: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textDecorationLine: 'underline',
  },
});
