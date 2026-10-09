import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Timestamp } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { ReorderStopsSheet } from '@/components/trip/ReorderStopsSheet';
import { TrashSimple, NotePencil, MagnifyingGlass, MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { TripDay, TripActivity } from '@/types';
import { BookedRow } from '@/components/trip/BookedRow';
import { bookingLines, bookingMatchesStop, type DayBooking, type TripBooking } from '@/utils/bookingDays';
import { ActivityItem } from './ActivityItem';

interface DayTimelineProps {
  day: TripDay;
  onAddActivity?: () => void;
  /** Opens the place-search flow (Part B) to add a grounded stop to this day. */
  onAddStop?: () => void;
  onEditActivity?: (activity: TripActivity) => void;
  /** Fired when an activity row is tapped — used to lazily ground AI-generated stops. */
  onActivityPress?: (activity: TripActivity, dayId: string) => void;
  /** Fired when the icon bubble is tapped — toggles manual visited tracking (TM-2b). */
  onToggleVisited?: (activity: TripActivity, dayId: string) => void;
  /** Fired once, on drop, with the full new order — never during the drag itself. */
  onReorderActivities?: (dayId: string, orderedActivities: TripActivity[]) => void;
  /** Owner-only: delete this whole day. */
  onDeleteDay?: () => void;
  /** Activity id currently being lazily resolved, if any. */
  resolvingActivityId?: string | null;
  /** Activity id to briefly highlight — set after "View in timeline" from the map. */
  highlightActivityId?: string | null;
  /** The trip's next not-yet-visited stop, in day/order sequence — "you are here". */
  currentActivityId?: string | null;
  editable?: boolean;
  /** Wallet bookings on this day (utils/bookingDays bookingsByDay): yours plus what other members share with the trip. */
  dayBookings?: DayBooking[];
  onBookingPress?: (booking: TripBooking) => void;
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
  onToggleVisited,
  onReorderActivities,
  onDeleteDay,
  resolvingActivityId = null,
  highlightActivityId = null,
  currentActivityId = null,
  editable = false,
  dayBookings,
  onBookingPress,
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
  const handleToggleVisited = useCallback(
    (activity: TripActivity) => onToggleVisited?.(activity, day.id),
    [onToggleVisited, day.id],
  );
  const sorted = useMemo(() => [...day.activities].sort((a, b) => a.order - b.order), [day.activities]);

  // A booking for the same place as a stop becomes a "Booked" line on that
  // stop; the rest show as their own rows above the stops — not between
  // them, which would put fixed rows inside the drag-to-reorder list.
  const { bookedByStop, bookedTimeByStop, bookedRows } = useMemo(() => {
    const byStop: Record<string, string> = {};
    const timeByStop: Record<string, string | null> = {};
    const rows: DayBooking[] = [];
    for (const entry of dayBookings ?? []) {
      const stop = entry.role === 'staying'
        ? undefined
        : sorted.find((a) => !byStop[a.id] && bookingMatchesStop(entry.booking, a));
      if (stop) {
        byStop[stop.id] = bookingLines(entry).detail || 'Booked';
        timeByStop[stop.id] = entry.time;
      }
      else rows.push(entry);
    }
    rows.sort((a, b) => {
      if (a.role === 'staying' || b.role === 'staying') return a.role === 'staying' ? -1 : 1;
      return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
    });
    return { bookedByStop: byStop, bookedTimeByStop: timeByStop, bookedRows: rows };
  }, [dayBookings, sorted]);
  const hasActivities = sorted.length > 0;
  const hasNotes = Boolean(day.notes);
  const canDrag = editable && !!onReorderActivities && sorted.length > 1;

  // A tap you can feel when the stop lifts, so it's clear the long press took.
  // Long-press a stop → the day's reorder screen (components/trip/ReorderStopsSheet). Not drag-in-place:
  // a draggable list nested in the trip page's scroll lifted the stop to the top and wouldn't move it.
  const [reorderOpen, setReorderOpen] = useState(false);
  const openReorder = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReorderOpen(true);
  }, []);
  const closeReorder = useCallback(() => setReorderOpen(false), []);
  const saveOrder = useCallback(
    (ordered: TripActivity[]) => onReorderActivities?.(day.id, ordered),
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

  const renderStop = useCallback(
    (item: TripActivity, index: number) => {
      const isLast = index === sorted.length - 1;
      return (
        <View key={item.id}>
          <ActivityItem
            activity={item}
            onPress={onActivityPress ? () => handleActivityPress(item) : undefined}
            onEdit={onEditActivity ? () => handleEditActivity(item) : undefined}
            onLongPress={canDrag ? openReorder : undefined}
            onToggleVisited={onToggleVisited ? () => handleToggleVisited(item) : undefined}
            showEdit={editable}
            isResolving={resolvingActivityId === item.id}
            isHighlighted={highlightActivityId === item.id}
            isCurrent={currentActivityId === item.id}
            bookedDetail={bookedByStop[item.id]}
            bookedTime={bookedTimeByStop[item.id]}
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
      onToggleVisited,
      handleToggleVisited,
      canDrag,
      openReorder,
      editable,
      resolvingActivityId,
      highlightActivityId,
      currentActivityId,
      colors.background.cardBorder,
      bookedByStop,
      bookedTimeByStop,
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

      {/* ── Your bookings this day (private to you) ── */}
      {bookedRows.length > 0 && (
        <View style={styles.bookedBlock}>
          {bookedRows.map((entry) => (
            <BookedRow key={`${entry.booking.kind}_${entry.booking.item.id}-${entry.role}`} entry={entry} onPress={onBookingPress} />
          ))}
        </View>
      )}

      {/* ── Activities ── */}
      {hasActivities ? (
        <View style={styles.activitiesContainer}>{sorted.map(renderStop)}</View>
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
      {canDrag && (
        <ReorderStopsSheet
          visible={reorderOpen}
          dayLabel={`Day ${day.dayNumber}`}
          stops={sorted}
          onClose={closeReorder}
          onSave={saveOrder}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bookedBlock: { marginBottom: Spacing['2'] },
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
