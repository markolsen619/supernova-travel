/**
 * Home's Today card (spec 2026-10-29): cover, "TODAY · DAY N OF M", today's city, up to 4 stops with the next one
 * not marked visited, today's booking, and "Nothing planned today · Add a stop" on an empty day.
 */
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { bookingLines, type DayBooking } from '@/utils/bookingDays';
import type { TodayInfo } from '@/utils/todayCard';
import type { TripWithDays } from '@/types';
import { BookingLine } from './BookingLine';
import { InviteButton } from '@/components/trip/InviteButton';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const TodayCard = memo(function TodayCard({ trip, info, booking }: { trip: TripWithDays; info: TodayInfo; booking: DayBooking | null }) {
  const { colors } = useTheme();
  const openTrip = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${trip.id}`); }, [trip.id]);
  const title = info.city ?? trip.title;
  return (
    <Pressable onPress={openTrip} style={[styles.card, { backgroundColor: colors.background.card }]} accessibilityRole="button" accessibilityLabel={`Today in ${title}, day ${info.dayNumber} of ${info.totalDays}. Open the trip`}>
      <View style={[styles.cover, { backgroundColor: colors.background.sunken }]}>
        {trip.coverImageUrl ? <Image source={{ uri: trip.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={styles.pill}><Text style={styles.pillText}>{`TODAY · DAY ${info.dayNumber} OF ${info.totalDays}`}</Text></View>
        <InviteButton trip={trip} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{title}</Text>
        {info.city && trip.title ? <Text style={[styles.sub, { color: colors.text.secondary }]} numberOfLines={1}>{trip.title}</Text> : null}
        {info.stops.map((s) => (
          <View key={s.id} style={styles.stop}>
            <View style={[styles.dot, { backgroundColor: s.next ? colors.brand.purple : colors.background.cardBorder }, s.next && styles.dotNext]} />
            <Text
              style={[styles.stopText, { color: s.next ? colors.text.primary : s.visited ? colors.text.tertiary : colors.text.secondary }, s.next && styles.stopNext]}
              numberOfLines={1}
            >
              {s.next ? `Next: ${s.title}` : s.title}
            </Text>
          </View>
        ))}
        {info.nothingPlanned ? (
          <View style={styles.empty}>
            <Text style={[styles.sub, { color: colors.text.secondary }]}>Nothing planned today</Text>
            <Pressable onPress={openTrip} hitSlop={10} style={styles.add} accessibilityRole="button" accessibilityLabel="Add a stop">
              <Text style={[styles.addText, { color: colors.brand.purple }]}>Add a stop</Text>
            </Pressable>
          </View>
        ) : null}
        {booking ? <BookingLine booking={booking} lines={bookingLines(booking)} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, overflow: 'hidden' },
  cover: { height: 140 },
  pill: { position: 'absolute', top: Spacing['3'], left: Spacing['3'], backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 0.9 },
  body: { padding: Spacing['4'], gap: Spacing['2'] },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.semiBold, letterSpacing: -0.4 },
  sub: { fontSize: FontSize.sm },
  stop: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotNext: { width: 10, height: 10, borderRadius: 5 },
  stopText: { fontSize: FontSize.base, flex: 1 },
  stopNext: { fontWeight: FontWeight.semiBold },
  empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { minHeight: 44, justifyContent: 'center' },
  addText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
