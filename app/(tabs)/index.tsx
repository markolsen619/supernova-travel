/** Home (spec docs/superpowers/specs/2026-10-29-home-landing-design.md): everything at a glance. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useOwnAndJoinedTrips } from '@/hooks/useTripList';
import { useTrip } from '@/hooks/useTrip';
import { useTripBookings } from '@/hooks/useTripBookings';
import { useDestinations } from '@/hooks/useDestinations';
import { useNow } from '@/hooks/useNow';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { HomeHeader } from '@/components/home/HomeHeader';
import { TodayCard } from '@/components/home/TodayCard';
import { NextTripCard } from '@/components/home/NextTripCard';
import { TripRow } from '@/components/home/TripRow';
import { InspiredStrip } from '@/components/home/InspiredStrip';
import { PlanCard } from '@/components/home/PlanCard';
import { homeEyebrow, homeTrips, tripSpan } from '@/utils/homeState';
import { countdownLabel, todayCityIndex, todayInfo, todaysBooking } from '@/utils/todayCard';
import { firstName, greeting } from '@/utils/greeting';
import { toCalendarDate } from '@/utils/calendarDate';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const profile = useUserStore((s) => s.profile);
  const { data: trips = [], refetch } = useOwnAndJoinedTrips(uid);
  const { destinations } = useDestinations();
  const now = useNow();
  const today = toCalendarDate(now);
  // A fresh day or a return to the app: the badge may be stale too.
  useEffect(() => { queryClient.invalidateQueries({ queryKey: ['inboxBadge'] }); }, [now, queryClient]);
  const h = useMemo(() => homeTrips(trips, today), [trips, today]);
  const lead = h.today ?? h.next;
  // The full itinerary only for a trip under way (the next trip's card needs none of it — reads cost).
  const { data: leadTrip } = useTrip(h.today?.id ?? null);
  const { bookings } = useTripBookings(lead?.id ?? null);
  const info = h.today && leadTrip ? todayInfo(leadTrip, today) : null;
  const leadStart = lead ? tripSpan(lead).start : null;
  // Today: today's booking; a trip ahead: the booking on its first day (usually the flight out).
  const booking = h.today ? todaysBooking(bookings, today) : leadStart ? todaysBooking(bookings, leadStart) : null;
  const todaySpan = h.today ? tripSpan(h.today) : null;
  const todayCity = info && leadTrip && todaySpan?.start && todaySpan.end
    ? [leadTrip.destination, ...(leadTrip.additionalDestinations ?? [])][todayCityIndex(leadTrip, info.dayNumber, todaySpan.start, todaySpan.end)] ?? leadTrip.destination
    : null;
  const hello = greeting({ name: firstName(profile?.fullName), now, countryCode: todayCity?.countryCode ?? null });
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['inboxBadge'] }),
      lead ? queryClient.invalidateQueries({ queryKey: ['trip', lead.id] }) : null,
    ]);
    setRefreshing(false);
  }, [refetch, queryClient, lead]);

  return (
    <ScreenEntrance>
      <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
        <HomeHeader topInset={insets.top} />
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text.tertiary} />}
        >
          <View style={styles.greet}>
            <Text style={[styles.dateLine, { color: colors.text.tertiary }]}>{dateLine}</Text>
            <Text style={[styles.hello, { color: colors.text.primary }]}>{hello}</Text>
          </View>
          {h.today && leadTrip && info ? <TodayCard trip={leadTrip} info={info} booking={booking} /> : null}
          {h.next && leadStart ? (
            <NextTripCard trip={h.next} label={countdownLabel(leadStart, today)} eyebrow={homeEyebrow(tripSpan(h.next), today)} booking={booking} />
          ) : null}
          {h.isEmpty ? <PlanCard /> : null}
          {h.comingUp.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Coming up</Text>
              {h.comingUp.map((t) => <TripRow key={t.id} trip={t} eyebrow={homeEyebrow(tripSpan(t), today)} />)}
            </View>
          ) : null}
          {h.showInspired ? <InspiredStrip destinations={destinations} /> : null}
        </ScrollView>
      </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: Spacing['5'], paddingBottom: 120, gap: Spacing['5'] },
  greet: { paddingTop: Spacing['4'], gap: 2 },
  dateLine: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  hello: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  section: { gap: Spacing['2'] },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
});
