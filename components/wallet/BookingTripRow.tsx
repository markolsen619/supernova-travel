import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretRight, MapTrifold } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useProGate } from '@/hooks/useProGate';
import { useMyTrips } from '@/hooks/useMyTrips';
import { useBookingTripLink } from '@/hooks/useBookingTripLink';
import { TripPickerSheet } from '@/components/wallet/TripPickerSheet';
import { tripDateEyebrow } from '@/utils/walletLink';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface BookingTripRowProps {
  kind: 'boarding_pass' | 'reservation';
  item: { id: string; tripId?: string | null };
}

/** The booking's trip on its detail screen: open it, change it, remove it — or add one (Pro). */
export function BookingTripRow({ kind, item }: BookingTripRowProps) {
  const { colors } = useTheme();
  const { isPro, openPaywall } = useProGate();
  const { trips, isLoading } = useMyTrips();
  const { link, unlink, pending } = useBookingTripLink(kind, item.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const trip = item.tripId ? trips.find((t) => t.tripId === item.tripId) : undefined;

  const openPicker = useCallback(() => {
    if (!isPro) {
      openPaywall();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerOpen(true);
  }, [isPro, openPaywall]);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const openTrip = useCallback(() => {
    if (!trip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.tripId}`);
  }, [trip]);

  const card = { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder };
  if (item.tripId && isLoading) return <View style={[styles.card, styles.placeholder, card]} />;

  return (
    <View style={[styles.card, card]}>
      {item.tripId ? (
        <>
          {trip ? (
            <TouchableOpacity onPress={openTrip} style={styles.tripLine} accessibilityRole="link" accessibilityLabel={`Open ${trip.title}`}>
              <View style={styles.tripText}>
                <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>
                  TRIP · {tripDateEyebrow(trip.start, trip.end)}
                </Text>
                <Text style={[styles.tripTitle, { color: colors.text.primary }]} numberOfLines={2}>{trip.title}</Text>
              </View>
              <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.unavailable, { color: colors.text.secondary }]}>Trip unavailable</Text>
          )}
          <View style={[styles.actions, { borderColor: colors.background.cardBorder }]}>
            {trip && (
              <TouchableOpacity onPress={openPicker} style={styles.action} disabled={pending}>
                <Text style={[styles.actionText, { color: colors.text.primary }]}>Change</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={unlink} style={styles.action} disabled={pending}>
              <Text style={[styles.actionText, { color: colors.text.secondary }]}>Remove from trip</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity onPress={openPicker} style={styles.addLine} accessibilityRole="button" disabled={pending}>
          <MapTrifold size={20} color={colors.text.primary} weight="duotone" />
          <Text style={[styles.addText, { color: colors.text.primary }]}>Add to a trip</Text>
          <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      )}
      <TripPickerSheet visible={pickerOpen} currentTripId={item.tripId} onPick={link} onClose={closePicker} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing['4'], overflow: 'hidden' },
  placeholder: { height: 72 },
  tripLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], padding: Spacing['4'], minHeight: 64 },
  tripText: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  tripTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  unavailable: { padding: Spacing['4'], fontSize: FontSize.sm },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], padding: Spacing['4'], minHeight: 56 },
  addText: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.medium },
});
