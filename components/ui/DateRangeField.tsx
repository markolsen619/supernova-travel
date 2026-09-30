/**
 * components/ui/DateRangeField.tsx
 *
 * The one date control on trip forms: a single field showing the whole stay
 * ("Jul 25 – 30 · 6 days") that opens DateRangeSheet. Owns the sheet's
 * open/closed state so a form only holds the two dates.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CalendarBlank } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { DateRangeSheet } from '@/components/ui/DateRangeSheet';
import { FontSize } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { formatRangeLabel } from '@/utils/dateRange';

export interface DateRangeFieldProps {
  start: Date | null;
  end: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  /** When false the trip must have dates, so the sheet offers no "Clear". */
  optional?: boolean;
  minDate?: Date | null;
  maxDays?: number | null;
  placeholder?: string;
}

export function DateRangeField({
  start,
  end,
  onChange,
  optional = true,
  minDate,
  maxDays,
  placeholder = 'Add your dates',
}: DateRangeFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
  }, []);
  const handleClose = useCallback(() => setOpen(false), []);
  const handleConfirm = useCallback(
    (s: Date, e: Date) => {
      onChange(s, e);
      setOpen(false);
    },
    [onChange],
  );
  const handleClear = useCallback(() => {
    onChange(null, null);
    setOpen(false);
  }, [onChange]);

  const label = start && end ? formatRangeLabel(start, end) : placeholder;

  return (
    <>
      <TouchableOpacity
        style={[styles.field, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
        onPress={handleOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={start && end ? `Trip dates, ${label}. Change dates` : placeholder}
      >
        <CalendarBlank size={18} color={start && end ? colors.brand.purple : colors.text.tertiary} weight="duotone" />
        <Text style={[styles.text, { color: start && end ? colors.text.primary : colors.text.tertiary }]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>

      <DateRangeSheet
        visible={open}
        start={start}
        end={end}
        onConfirm={handleConfirm}
        onCancel={handleClose}
        onClear={optional ? handleClear : undefined}
        minDate={minDate}
        maxDays={maxDays}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    minHeight: 44,
  },
  text: { flex: 1, fontSize: FontSize.base },
});
