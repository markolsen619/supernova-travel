import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Bed } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { ACTIVITY_ICONS, RESERVATION_ICONS } from '@/constants/icons';
import { bookingLines, reservationKind, type DayBooking, type TripBooking } from '@/utils/bookingDays';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface BookedRowProps {
  entry: DayBooking;
  onPress?: (booking: TripBooking) => void;
}

/** One of your wallet bookings on a trip day. "Staying" nights are a slim line. */
export function BookedRow({ entry, onPress }: BookedRowProps) {
  const { colors } = useTheme();
  const { title, detail } = bookingLines(entry);
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(entry.booking);
  }, [onPress, entry.booking]);

  if (entry.role === 'staying') {
    return (
      <TouchableOpacity onPress={handlePress} style={styles.slim} accessibilityRole="button" accessibilityLabel={title}>
        <Bed size={14} color={colors.text.tertiary} weight="duotone" />
        <Text style={[styles.slimText, { color: colors.text.secondary }]} numberOfLines={1}>{title}</Text>
      </TouchableOpacity>
    );
  }

  const { Icon, color } = entry.booking.kind === 'boarding_pass'
    ? ACTIVITY_ICONS.flight
    : RESERVATION_ICONS[reservationKind(entry.booking.item)];
  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.row, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
      accessibilityRole="button"
      accessibilityLabel={[title, detail].filter(Boolean).join(', ')}
    >
      <TypeIconBubble Icon={Icon} color={color} bubbleSize={36} iconSize={18} />
      <View style={styles.text}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>BOOKED</Text>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{title}</Text>
        {!!detail && <Text style={[styles.detail, { color: colors.text.tertiary }]} numberOfLines={1}>{detail}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], padding: Spacing['3'], minHeight: 56,
    borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing['2'],
  },
  text: { flex: 1, gap: 1 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  detail: { fontSize: 13 },
  slim: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44, marginBottom: Spacing['1'] },
  slimText: { flex: 1, fontSize: 13 },
});
