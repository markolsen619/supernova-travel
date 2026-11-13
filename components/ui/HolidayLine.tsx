import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarX } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useHoliday } from '@/hooks/useHoliday';
import { holidayLine } from '@/utils/holidays';
import { FontSize } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

/** A public holiday on this date in this country (spec 2026-11-12), or nothing. Nager.Date, cached on the phone. */
export const HolidayLine = memo(function HolidayLine({ countryCode, date }: { countryCode: string | null; date: string | null }) {
  const { colors } = useTheme();
  const holiday = useHoliday(countryCode, date);
  if (!holiday) return null;
  return (
    <View style={styles.row} accessibilityRole="text">
      <CalendarX size={14} color={colors.accent.amber} weight="duotone" />
      <Text style={[styles.text, { color: colors.text.secondary }]} numberOfLines={2}>{holidayLine(holiday)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['1'] + 2, marginTop: Spacing['1'] },
  text: { flex: 1, fontSize: FontSize.sm, lineHeight: 18 },
});
