import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus, Wallet as WalletIcon } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useMyTrips } from '@/hooks/useMyTrips';
import { useSharedTripBookings } from '@/hooks/useTripBookings';
import { useProGate } from '@/hooks/useProGate';
import { WalletByTripList } from '@/components/wallet/WalletByTripList';
import { defaultSegment } from '@/utils/walletByTrip';
import { EmailImportRow } from '@/components/wallet/EmailImportRow';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { useReservations } from '@/hooks/useReservations';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { ReservationCard } from '@/components/wallet/ReservationCard';
import { LoyaltyCard } from '@/components/wallet/LoyaltyCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { useWalletAllowance } from '@/hooks/useWalletAllowance';

type Segment = 'all' | 'flights' | 'reservations' | 'loyalty' | 'trips';

const SEGMENTS: { key: Segment; label: string }[] = [
  // Pro: the wallet grouped by trip (components/wallet/WalletByTripList). First, and where Pro lands.
  { key: 'trips', label: 'By trip' },
  { key: 'all', label: 'All' },
  { key: 'flights', label: 'Flights' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'loyalty', label: 'Loyalty' },
];

export default function WalletHubScreen() {
  const { colors } = useTheme();
  const { isPro, openPaywall } = useProGate();
  // Untouched, Pro opens on By trip and everyone else on All (utils/walletByTrip defaultSegment).
  const [picked, setSegment] = useState<Segment | null>(null);
  const segment: Segment = picked ?? defaultSegment(isPro);

  const { boardingPasses, isLoading: passesLoading } = useBoardingPasses();
  const { reservations, isLoading: reservationsLoading } = useReservations();
  // Linked items show their trip as an eyebrow; only fetch trips when something is linked.
  const anyLinked = boardingPasses.some((p) => p.tripId) || reservations.some((r) => r.tripId);
  const { trips: myTrips, isLoading: tripsLoading } = useMyTrips(anyLinked || segment === 'trips');
  const myTripIds = useMemo(() => myTrips.map((t) => t.tripId), [myTrips]);
  const { shared: sharedBookings } = useSharedTripBookings(myTripIds, segment === 'trips');
  const tripTitleFor = (tripId?: string | null) => (tripId ? myTrips.find((t) => t.tripId === tripId)?.title : undefined);
  const { loyaltyPrograms, isLoading: loyaltyLoading } = useLoyaltyPrograms();

  const isLoading = passesLoading || reservationsLoading || loyaltyLoading;

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSelectSegment = useCallback((s: Segment) => {
    // Bookings are linked to trips on Pro, so "By trip" is Pro too.
    if (s === 'trips' && !isPro) {
      openPaywall();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSegment(s);
  }, [isPro, openPaywall]);

  const allowance = useWalletAllowance();

  const handleAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Free plan: two items in total; past that, adding is Pro.
    if (!allowance.canAdd) {
      allowance.openPaywall();
      return;
    }
    if (segment === 'loyalty') {
      // Import only produces boarding passes/reservations (see the design
      // spec's scope split) — from the Loyalty segment, manual entry is the
      // only sensible destination, so this stays a direct link rather than
      // routing through Import just to bounce back out to manual anyway.
      router.push('/(wallet)/loyalty/add');
      return;
    }
    router.push('/(wallet)/import');
  }, [segment, allowance]);

  const showFlights = segment === 'all' || segment === 'flights';
  const showReservations = segment === 'all' || segment === 'reservations';
  const showLoyalty = segment === 'all' || segment === 'loyalty';

  const categoriesWithContent = useMemo(
    () =>
      [boardingPasses.length > 0, reservations.length > 0, loyaltyPrograms.length > 0].filter(Boolean)
        .length,
    [boardingPasses.length, reservations.length, loyaltyPrograms.length],
  );
  const showSectionLabels = segment === 'all' && categoriesWithContent > 1;

  const walletIsEmpty = boardingPasses.length === 0 && reservations.length === 0 && loyaltyPrograms.length === 0;

  const currentSegmentIsEmpty =
    (segment === 'flights' && boardingPasses.length === 0) ||
    (segment === 'reservations' && reservations.length === 0) ||
    (segment === 'loyalty' && loyaltyPrograms.length === 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader
        title="Wallet"
        onBack={handleBack}
        rightAction={{ icon: Plus, onPress: handleAdd, label: 'Add to wallet' }}
      />

      {/* Free plan: say where the allowance stands before it's hit, not after. */}
      {!allowance.isPro && !isLoading ? (
        <TouchableOpacity
          onPress={allowance.openPaywall}
          style={styles.planRow}
          accessibilityRole="button"
          accessibilityLabel={`Free plan, ${Math.min(allowance.total, allowance.limit)} of ${allowance.limit} items used. Get Pro for an unlimited wallet`}
        >
          <Text style={[styles.planText, { color: colors.text.tertiary }]}>
            {`FREE PLAN · ${Math.min(allowance.total, allowance.limit)} OF ${allowance.limit} ITEMS`}
          </Text>
          <Text style={[styles.planLink, { color: colors.brand.purple }]}>Get unlimited</Text>
        </TouchableOpacity>
      ) : null}

      {/* Forwarding address for confirmation emails (Pro). */}
      <EmailImportRow />

      {/* Segmented control */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.segmentsScroll}
        contentContainerStyle={styles.segments}
      >
        {SEGMENTS.map(({ key, label }) => {
          const isSelected = segment === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => handleSelectSegment(key)}
              style={[
                styles.segmentPill,
                {
                  backgroundColor: isSelected ? colors.text.primary : colors.background.sunken,
                },
              ]}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  { color: isSelected ? colors.background.primary : colors.text.secondary },
                ]}
                numberOfLines={1}
              >
                {label}
                {key === 'trips' && !isPro ? '  PRO' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      {isLoading || (segment === 'trips' && tripsLoading) ? (
        <View style={{ paddingHorizontal: Spacing['5'], paddingTop: Spacing['2'], gap: Spacing['4'] }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} height={120} radius={BorderRadius.xl} />
          ))}
        </View>
      ) : segment === 'trips' ? (
        // Before the empty wallet: your trips, and what others share with them, show even when you've booked nothing.
        <WalletByTripList trips={myTrips} boardingPasses={boardingPasses} reservations={reservations} shared={sharedBookings} />
      ) : walletIsEmpty ? (
        <EmptyState
          icon={WalletIcon}
          title="Your wallet is empty"
          description="Add a boarding pass, reservation, or loyalty program to get started."
          actionLabel="Add to wallet"
          onAction={handleAdd}
          actionHaptic="none"
        />
      ) : currentSegmentIsEmpty ? (
        <EmptyState
          size="sm"
          icon={WalletIcon}
          title={`No ${SEGMENTS.find((s) => s.key === segment)?.label.toLowerCase()} yet`}
          actionLabel="Add"
          onAction={handleAdd}
          actionHaptic="none"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: Spacing['2'], paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {showFlights && boardingPasses.length > 0 && (
            <>
              {showSectionLabels && (
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Flights</Text>
              )}
              {boardingPasses.map((pass) => (
                <View key={pass.id}>
                  {!!tripTitleFor(pass.tripId) && (
                    <Text style={[styles.passTripEyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>
                      {tripTitleFor(pass.tripId)!.toUpperCase()}
                    </Text>
                  )}
                  <BoardingPassCard
                    pass={pass}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/(wallet)/boarding-pass/${pass.id}`);
                    }}
                  />
                </View>
              ))}
            </>
          )}

          {showReservations && reservations.length > 0 && (
            <>
              {showSectionLabels && (
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Reservations</Text>
              )}
              {reservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  tripTitle={tripTitleFor(reservation.tripId)}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(wallet)/reservation/${reservation.id}`);
                  }}
                />
              ))}
            </>
          )}

          {showLoyalty && loyaltyPrograms.length > 0 && (
            <>
              {showSectionLabels && (
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Loyalty</Text>
              )}
              {loyaltyPrograms.map((program) => (
                <LoyaltyCard
                  key={program.id}
                  program={program}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(wallet)/loyalty/${program.id}`);
                  }}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  passTripEyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9, marginHorizontal: Spacing['5'], marginTop: Spacing['3'], marginBottom: Spacing['1'] },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['5'],
    minHeight: 44,
  },
  planText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.08 * FontSize.xs },
  planLink: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  container: { flex: 1 },
  scroll: { flex: 1 },
  segments: {
    flexDirection: 'row',
    gap: Spacing['2'],
    // paddingTop was missing entirely, so the pills sat flush against the
    // header's hairline. paddingHorizontal moves 16 -> 20 to meet the design
    // system's screen-margin floor and line up with WalletHeader's nav row.
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['5'],
    paddingBottom: Spacing['4'],
  },
  segmentsScroll: { flexGrow: 0 },
  segmentPill: {
    paddingHorizontal: Spacing['4'],
    minHeight: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
});
