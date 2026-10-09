import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowRight, CaretDown, CaretRight, SuitcaseRolling } from 'phosphor-react-native';
import { useWalletSectionsStore } from '@/stores/useWalletSectionsStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { ReservationCard } from '@/components/wallet/ReservationCard';
import { bookingCountLabel, isSectionOpen, walletByTrip, type TripSection } from '@/utils/walletByTrip';
import { tripDateEyebrow, type TripSummary } from '@/utils/walletLink';
import { toCalendarDate } from '@/utils/calendarDate';
import type { BoardingPass, Reservation } from '@/types';
import type { TripBooking } from '@/utils/bookingDays';
import { bookingRoute, firstName } from '@/utils/sharedBookings';
import { FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface WalletByTripListProps {
  trips: TripSummary[];
  boardingPasses: BoardingPass[];
  reservations: Reservation[];
  /** Other members' bookings shared with these trips. */
  shared: TripBooking[];
}

/** The wallet grouped by trip (Pro): upcoming trips soonest first, then bookings on no trip, then past trips. */
export function WalletByTripList({ trips, boardingPasses, reservations, shared }: WalletByTripListProps) {
  const { colors } = useTheme();
  const [pastOpen, setPastOpen] = useState(false);
  const saved = useWalletSectionsStore((s) => s.open);
  const setOpen = useWalletSectionsStore((s) => s.setOpen);
  const toggleSection = useCallback((tripId: string, open: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(tripId, !open);
  }, [setOpen]);
  const grouped = useMemo(
    () => walletByTrip(trips, boardingPasses, reservations, toCalendarDate(new Date()), shared),
    [trips, boardingPasses, reservations, shared],
  );

  const openBooking = useCallback((b: TripBooking) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(bookingRoute(b) as Href);
  }, []);
  const openTrip = useCallback((tripId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${tripId}`);
  }, []);
  const togglePast = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPastOpen((o) => !o);
  }, []);

  const renderItems = (items: TripBooking[]) =>
    items.map((b) => (
      <View key={`${b.kind}_${b.item.id}_${b.sharedBy?.uid ?? 'me'}`}>
        {b.sharedBy && (
          <Text style={[styles.sharedBy, { color: colors.text.tertiary }]}>
            {firstName(b.sharedBy.name).toUpperCase()}&apos;S BOOKING
          </Text>
        )}
        {b.kind === 'boarding_pass' ? (
          <BoardingPassCard pass={b.item} onPress={() => openBooking(b)} />
        ) : (
          <ReservationCard reservation={b.item} onPress={() => openBooking(b)} />
        )}
      </View>
    ));

  // Past trips start folded whatever their position (only the soonest upcoming trip starts open).
  const renderSection = (s: TripSection, index: number) => {
    const open = isSectionOpen(s.trip.tripId, index, saved);
    const Caret = open ? CaretDown : CaretRight;
    return (
      <View key={s.trip.tripId} style={styles.section}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => toggleSection(s.trip.tripId, open)}
            style={styles.headerToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${s.trip.title}, ${tripDateEyebrow(s.trip.start, s.trip.end)}, ${bookingCountLabel(s.items.length)}`}
          >
            <Caret size={14} color={colors.text.tertiary} weight="bold" />
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{tripDateEyebrow(s.trip.start, s.trip.end)}</Text>
              <Text style={[styles.tripTitle, { color: colors.text.primary }]} numberOfLines={2}>{s.trip.title}</Text>
              {!open && (
                <Text style={[styles.count, { color: colors.text.tertiary }]}>{bookingCountLabel(s.items.length)}</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openTrip(s.trip.tripId)}
            style={[styles.openTrip, { backgroundColor: colors.background.sunken }]}
            accessibilityRole="link"
            accessibilityLabel={`Open ${s.trip.title}`}
          >
            <ArrowRight size={16} color={colors.text.primary} weight="bold" />
          </TouchableOpacity>
        </View>
        {open && (
          <Animated.View entering={FadeIn.springify().damping(11).stiffness(65)}>
            {s.items.length > 0 ? (
              renderItems(s.items)
            ) : (
              <Text style={[styles.empty, { color: colors.text.tertiary }]}>
                Nothing booked yet · Forward a confirmation or add one
              </Text>
            )}
          </Animated.View>
        )}
      </View>
    );
  };

  const openNewTrip = useCallback(() => router.push('/trip/new'), []);

  if (grouped.upcoming.length === 0 && grouped.past.length === 0 && grouped.unlinked.length === 0) {
    return (
      <EmptyState
        icon={SuitcaseRolling}
        title="Your trips, with their bookings"
        description="Plan a trip and the flights, trains and stays you add for it gather here."
        actionLabel="Plan a trip"
        onAction={openNewTrip}
        actionHaptic="light"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {grouped.upcoming.map((s, i) => renderSection(s, i))}

      {grouped.unlinked.length > 0 && (
        <View style={styles.section}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>NOT ON A TRIP</Text>
              <Text style={[styles.hint, { color: colors.text.tertiary }]}>Open one to add it to a trip.</Text>
            </View>
          </View>
          {renderItems(grouped.unlinked)}
        </View>
      )}

      {grouped.past.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            onPress={togglePast}
            style={styles.header}
            accessibilityRole="button"
            accessibilityState={{ expanded: pastOpen }}
          >
            <Text style={[styles.eyebrow, styles.headerText, { color: colors.text.tertiary }]}>
              PAST TRIPS ({grouped.past.length})
            </Text>
            {pastOpen ? (
              <CaretDown size={16} color={colors.text.tertiary} weight="bold" />
            ) : (
              <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
            )}
          </TouchableOpacity>
          {pastOpen && (
            <Animated.View entering={FadeIn.springify().damping(11).stiffness(65)}>
              {grouped.past.map((s) => renderSection(s, -1))}
            </Animated.View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: Spacing['2'], paddingBottom: 100 },
  section: { marginBottom: Spacing['6'] },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['3'],
    paddingHorizontal: Spacing['5'], minHeight: 44, marginBottom: Spacing['2'],
  },
  headerText: { flex: 1, gap: 2 },
  headerToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44 },
  openTrip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 13 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  tripTitle: { fontSize: 17, fontWeight: FontWeight.medium },
  hint: { fontSize: 13 },
  sharedBy: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, paddingHorizontal: Spacing['5'], marginBottom: Spacing['1'] },
  empty: { fontSize: 13, paddingHorizontal: Spacing['5'] },
});
