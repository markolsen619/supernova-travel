/**
 * components/ui/DateRangeSheet.tsx
 *
 * A month calendar for picking a trip's first and last day in one place:
 * tap the first day, tap the last, and the whole stay is drawn between them
 * with its length above. Replaces the old typed YYYY · MM · DD fields, which
 * made people do calendar arithmetic in their heads and hid how long the trip
 * was — the thing they were actually deciding.
 *
 * Used by the manual trip wizard, the AI generator, and EditTripSheet, so
 * dates are entered the same way everywhere. Selection rules live in
 * utils/dateRange.ts, where they are tested.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CaretLeft, CaretRight } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { Button } from '@/components/ui/Button';
import { SPRING } from '@/constants/motion';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import {
  dayCountLabel,
  formatRangeLabel,
  isDaySelectable,
  isSameDay,
  isWithinRange,
  monthGrid,
  selectDay,
  startOfDay,
  tripDayCount,
  type DateRange,
} from '@/utils/dateRange';

export interface DateRangeSheetProps {
  visible: boolean;
  start: Date | null;
  end: Date | null;
  onConfirm: (start: Date, end: Date) => void;
  onCancel: () => void;
  /** Shows a "Clear dates" link when the caller allows a trip without dates. */
  onClear?: () => void;
  minDate?: Date | null;
  maxDays?: number | null;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CELL_HEIGHT = 44;

function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function DateRangeSheet({
  visible,
  start,
  end,
  onConfirm,
  onCancel,
  onClear,
  minDate,
  maxDays,
}: DateRangeSheetProps) {
  const { colors } = useTheme();
  const { isLarge } = useLayout();

  const [range, setRange] = useState<DateRange>({ start, end });
  const anchor = start ?? minDate ?? new Date();
  const [cursor, setCursor] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() });
  const slide = useRef(new Animated.Value(0)).current;

  // Re-seed from the caller's dates each time the sheet opens, so cancelling
  // a half-made selection never leaks into the next open.
  useEffect(() => {
    if (!visible) return;
    setRange({ start, end });
    const a = start ?? minDate ?? new Date();
    setCursor({ year: a.getFullYear(), month: a.getMonth() });
  }, [visible, start, end, minDate]);

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const today = useMemo(() => startOfDay(new Date()), []);

  const earliestMonth = minDate ? { year: minDate.getFullYear(), month: minDate.getMonth() } : null;
  const canGoBack =
    !earliestMonth
    || cursor.year > earliestMonth.year
    || (cursor.year === earliestMonth.year && cursor.month > earliestMonth.month);

  const changeMonth = useCallback(
    (delta: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCursor((c) => {
        const next = new Date(c.year, c.month + delta, 1);
        return { year: next.getFullYear(), month: next.getMonth() };
      });
      // The new month slides in from the side it came from.
      slide.setValue(delta * 24);
      Animated.spring(slide, { toValue: 0, ...SPRING }).start();
    },
    [slide],
  );
  const handlePrev = useCallback(() => changeMonth(-1), [changeMonth]);
  const handleNext = useCallback(() => changeMonth(1), [changeMonth]);

  const handleDayPress = useCallback((day: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRange((r) => selectDay(r, day));
  }, []);

  const handleConfirm = useCallback(() => {
    if (range.start && range.end) onConfirm(range.start, range.end);
  }, [range, onConfirm]);

  const handleClear = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClear?.();
  }, [onClear]);

  const complete = !!range.start && !!range.end;
  const heading = complete
    ? formatRangeLabel(range.start!, range.end!)
    : range.start
      ? 'Now pick your last day'
      : 'Pick your first day';
  const hint = !complete && range.start && maxDays ? `Up to ${maxDays} days` : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close calendar" />
        <View style={[styles.sheet, isLarge && styles.sheetLarge, { backgroundColor: colors.background.elevated }]}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>TRIP DATES</Text>
          <Text style={[styles.heading, { color: colors.text.primary }]} accessibilityLiveRegion="polite">
            {heading}
          </Text>
          <Text style={[styles.hint, { color: colors.text.tertiary }]}>{hint ?? ' '}</Text>

          {/* Month navigation */}
          <View style={styles.monthRow}>
            <TouchableOpacity
              onPress={handlePrev}
              disabled={!canGoBack}
              style={styles.navBtn}
              accessibilityLabel="Previous month"
            >
              <CaretLeft size={18} weight="bold" color={canGoBack ? colors.text.primary : colors.text.disabled} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.text.primary }]}>
              {monthTitle(cursor.year, cursor.month)}
            </Text>
            <TouchableOpacity onPress={handleNext} style={styles.navBtn} accessibilityLabel="Next month">
              <CaretRight size={18} weight="bold" color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.weekday, { color: colors.text.tertiary }]}>{w}</Text>
            ))}
          </View>

          <Animated.View style={{ transform: [{ translateX: slide }] }}>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.cell} />;

                  const selectable = isDaySelectable(day, range, { minDate, maxDays });
                  const isStart = isSameDay(day, range.start);
                  const isEnd = isSameDay(day, range.end);
                  const isEndpoint = isStart || isEnd;
                  const inRange = isWithinRange(day, range);
                  const isToday = isSameDay(day, today);
                  const singleDay = isStart && isEnd;

                  return (
                    <Pressable
                      key={di}
                      style={styles.cell}
                      onPress={() => handleDayPress(day)}
                      disabled={!selectable}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isEndpoint || inRange, disabled: !selectable }}
                      accessibilityLabel={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    >
                      {/* The band joining the two ends — squared off where it
                          meets an endpoint so the stay reads as one shape. */}
                      {inRange && !singleDay ? (
                        <View
                          style={[
                            styles.band,
                            { backgroundColor: `${colors.brand.purple}1F` },
                            isStart && styles.bandStart,
                            isEnd && styles.bandEnd,
                          ]}
                        />
                      ) : null}
                      <View style={[styles.dayCircle, isEndpoint && { backgroundColor: colors.brand.purple }]}>
                        <Text
                          style={[
                            styles.dayText,
                            {
                              color: isEndpoint
                                ? colors.text.inverse
                                : selectable
                                  ? colors.text.primary
                                  : colors.text.disabled,
                            },
                            (isToday || isEndpoint) && styles.dayTextStrong,
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                        {isToday && !isEndpoint ? (
                          <View style={[styles.todayDot, { backgroundColor: colors.brand.purple }]} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Animated.View>

          <View style={styles.footer}>
            {onClear && (start || end) ? (
              <TouchableOpacity onPress={handleClear} style={styles.clearBtn} accessibilityRole="button">
                <Text style={[styles.clearText, { color: colors.text.secondary }]}>Clear dates</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onCancel} style={styles.clearBtn} accessibilityRole="button">
                <Text style={[styles.clearText, { color: colors.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
            )}
            <Button
              label={complete ? `Set ${dayCountLabel(tripDayCount(range.start!, range.end!))}` : 'Set dates'}
              onPress={handleConfirm}
              disabled={!complete}
              variant="primary"
              haptic="light"
              style={styles.confirmBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['6'],
    paddingBottom: Spacing['10'],
  },
  // iPad: a centred card rather than a sheet spanning the whole screen.
  sheetLarge: { width: '100%', maxWidth: 540, alignSelf: 'center' },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
    marginBottom: Spacing['1'],
  },
  heading: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize.xl,
  },
  hint: { fontSize: FontSize.sm, marginTop: 2, marginBottom: Spacing['3'] },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['2'],
  },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    paddingBottom: Spacing['2'],
  },
  cell: { flex: 1, height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, top: 4, bottom: 4 },
  bandStart: { left: '50%' },
  bandEnd: { right: '50%' },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: FontSize.base },
  dayTextStrong: { fontWeight: FontWeight.semiBold },
  todayDot: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing['5'],
    gap: Spacing['4'],
  },
  clearBtn: { minHeight: 44, justifyContent: 'center', paddingRight: Spacing['2'] },
  clearText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  confirmBtn: { flex: 1 },
});
