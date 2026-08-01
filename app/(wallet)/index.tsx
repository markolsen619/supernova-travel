import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus, Wallet as WalletIcon } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
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

type Segment = 'all' | 'flights' | 'reservations' | 'loyalty';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'flights', label: 'Flights' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'loyalty', label: 'Loyalty' },
];

export default function WalletHubScreen() {
  const { colors } = useTheme();
  const [segment, setSegment] = useState<Segment>('all');

  const { boardingPasses, isLoading: passesLoading } = useBoardingPasses();
  const { reservations, isLoading: reservationsLoading } = useReservations();
  const { loyaltyPrograms, isLoading: loyaltyLoading } = useLoyaltyPrograms();

  const isLoading = passesLoading || reservationsLoading || loyaltyLoading;

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSelectSegment = useCallback((s: Segment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSegment(s);
  }, []);

  const handleAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (segment === 'loyalty') {
      // Import only produces boarding passes/reservations (see the design
      // spec's scope split) — from the Loyalty segment, manual entry is the
      // only sensible destination, so this stays a direct link rather than
      // routing through Import just to bounce back out to manual anyway.
      router.push('/(wallet)/loyalty/add');
      return;
    }
    router.push('/(wallet)/import');
  }, [segment]);

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

      {/* Segmented control */}
      <View style={styles.segments}>
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
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={{ paddingHorizontal: Spacing['5'], paddingTop: Spacing['2'], gap: Spacing['4'] }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} height={120} radius={BorderRadius.xl} />
          ))}
        </View>
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
                <BoardingPassCard
                  key={pass.id}
                  pass={pass}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(wallet)/boarding-pass/${pass.id}`);
                  }}
                />
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
  container: { flex: 1 },
  scroll: { flex: 1 },
  segments: {
    flexDirection: 'row',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
  },
  segmentPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2'],
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
