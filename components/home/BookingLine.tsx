/** A booking on a Home card: one sunken row (flight, ticket, table or hotel move); tap opens it in the wallet. */
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import type { DayBooking } from '@/utils/bookingDays';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export const BookingLine = memo(function BookingLine({ booking, lines }: { booking: DayBooking; lines: { title: string; detail: string } }) {
  const { colors } = useTheme();
  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = booking.booking.item.id;
    router.push(booking.booking.kind === 'boarding_pass' ? `/(wallet)/boarding-pass/${id}` : `/(wallet)/reservation/${id}`);
  }, [booking]);
  return (
    <Pressable onPress={open} style={[styles.row, { backgroundColor: colors.background.sunken }]} accessibilityRole="button" accessibilityLabel={`${lines.title}. Open in your wallet`}>
      <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{lines.title}</Text>
      {lines.detail ? <Text style={[styles.detail, { color: colors.text.secondary }]} numberOfLines={1}>{lines.detail}</Text> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { borderRadius: 12, paddingHorizontal: Spacing['3'], paddingVertical: Spacing['2'], minHeight: 44, justifyContent: 'center', marginTop: Spacing['1'] },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  detail: { fontSize: FontSize.xs, marginTop: 2 },
});
