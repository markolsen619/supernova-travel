import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Timestamp } from 'firebase/firestore';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { TripDay, TripActivity } from '@/types';
import { ActivityItem } from './ActivityItem';

interface DayTimelineProps {
  day: TripDay;
  onAddActivity?: () => void;
  onEditActivity?: (activity: TripActivity) => void;
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
  onEditActivity,
  editable = false,
}: DayTimelineProps) {
  const { colors } = useTheme();
  const handleEditActivity = useCallback(
    (activity: TripActivity) => onEditActivity?.(activity),
    [onEditActivity],
  );
  const sorted = [...day.activities].sort((a, b) => a.order - b.order);
  const hasActivities = sorted.length > 0;
  const hasNotes = Boolean(day.notes);

  return (
    <View style={styles.container}>
      {/* ── Day header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.dayNumberBadge,
              { backgroundColor: colors.brand.purple + '33' },
            ]}
          >
            <Text style={[styles.dayNumberText, { color: colors.brand.purple }]}>
              {day.dayNumber}
            </Text>
          </View>
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
          <Text style={[styles.notesIcon, { color: colors.text.tertiary }]}>📝</Text>
        )}
      </View>

      {/* ── Activities ── */}
      {hasActivities ? (
        <View style={styles.activitiesContainer}>
          {sorted.map((activity, index) => (
            <View key={activity.id}>
              <ActivityItem
                activity={activity}
                onEdit={onEditActivity ? () => handleEditActivity(activity) : undefined}
                showEdit={editable}
              />
              {/* Connector line between items */}
              {index < sorted.length - 1 && (
                <View style={styles.connectorWrapper}>
                  <View
                    style={[
                      styles.connectorLine,
                      { backgroundColor: colors.background.cardBorder },
                    ]}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View
          style={[
            styles.emptyState,
            { borderColor: colors.background.cardBorder },
          ]}
        >
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            No activities yet
          </Text>
        </View>
      )}

      {/* ── Add activity button ── */}
      {editable && onAddActivity && (
        <TouchableOpacity
          onPress={onAddActivity}
          activeOpacity={0.75}
          style={[
            styles.addButton,
            {
              borderColor: colors.brand.purple + '66',
              backgroundColor: colors.brand.purple + '14',
            },
          ]}
        >
          <Text style={[styles.addButtonText, { color: colors.brand.purple }]}>
            + Add activity
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing['2'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['1'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing['2'],
  },
  dayNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  headerText: {
    flex: 1,
  },
  headerDate: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  headerTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
    marginTop: 1,
  },
  notesIcon: {
    fontSize: 14,
    marginLeft: Spacing['2'],
  },
  activitiesContainer: {
    gap: 0,
  },
  connectorWrapper: {
    alignItems: 'center',
    height: 8,
    paddingLeft: 59, // align with activity icon column
  },
  connectorLine: {
    width: 2,
    flex: 1,
  },
  emptyState: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['5'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
  },
  addButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['3'],
    alignItems: 'center',
    marginTop: Spacing['1'],
  },
  addButtonText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
});
