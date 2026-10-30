/** Home's next trip when you're not travelling (spec 2026-10-29): cover, countdown, dates, title, first booking. */
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { bookingLines, type DayBooking } from '@/utils/bookingDays';
import type { Trip } from '@/types';
import { BookingLine } from './BookingLine';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const NextTripCard = memo(function NextTripCard({ trip, label, eyebrow, booking }: { trip: Trip; label: string; eyebrow: string; booking: DayBooking | null }) {
  const { colors } = useTheme();
  const open = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${trip.id}`); }, [trip.id]);
  return (
    <Pressable onPress={open} style={[styles.card, { backgroundColor: colors.background.card }]} accessibilityRole="button" accessibilityLabel={`${trip.title}, ${label.toLowerCase()}. Open the trip`}>
      <View style={[styles.cover, { backgroundColor: colors.background.sunken }]}>
        {trip.coverImageUrl ? <Image source={{ uri: trip.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={styles.pill}><Text style={styles.pillText}>{label}</Text></View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>{trip.title}</Text>
        {booking ? <BookingLine booking={booking} lines={bookingLines(booking)} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, overflow: 'hidden' },
  cover: { height: 150 },
  pill: { position: 'absolute', top: Spacing['3'], left: Spacing['3'], backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 0.9 },
  body: { padding: Spacing['4'], gap: Spacing['1'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.semiBold, letterSpacing: -0.4 },
});
