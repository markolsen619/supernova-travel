import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { UsersThree } from 'phosphor-react-native';
import { db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { ReservationCard } from '@/components/wallet/ReservationCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { firstName, fromSharedDoc, sharedDetailRows } from '@/utils/sharedBookings';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const noop = () => {};

/**
 * A trip member's booking, read-only: the barcode-free copy at
 * `trips/{tripId}/bookings/{id}` (functions/src/sharedBookings.ts).
 */
export default function SharedBookingScreen() {
  const { colors } = useTheme();
  const { tripId, id } = useLocalSearchParams<{ tripId: string; id: string }>();
  const { data: booking, isLoading } = useQuery({
    queryKey: ['sharedBooking', tripId, id],
    enabled: !!tripId && !!id,
    queryFn: async () => {
      try {
        const snap = await getDoc(doc(db, 'trips', tripId!, 'bookings', id!));
        return snap.exists() ? fromSharedDoc(snap.data()) : null;
      } catch {
        return null; // no longer a member, or no longer shared
      }
    },
  });

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const title = booking?.kind === 'boarding_pass' ? 'Flight' : 'Reservation';
  const name = booking?.sharedBy ? firstName(booking.sharedBy.name) : '';

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <WalletHeader title="Booking" onBack={handleBack} />
        <View style={styles.body}><SkeletonCard height={160} radius={BorderRadius.xl} /></View>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <WalletHeader title="Booking" onBack={handleBack} />
        <View style={styles.centered}>
          <EmptyState
            icon={UsersThree}
            title="This booking isn't shared anymore"
            description="Its owner may have kept it to themselves, removed it from the trip, or deleted it."
            actionLabel="Back to the trip"
            onAction={handleBack}
            actionHaptic="none"
          />
        </View>
      </View>
    );
  }

  const rows = sharedDetailRows(booking);
  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader title={title} eyebrow={`${name.toUpperCase()}'S BOOKING`} onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {booking.kind === 'boarding_pass' ? (
          <BoardingPassCard pass={booking.item} onPress={noop} />
        ) : (
          <ReservationCard reservation={booking.item} onPress={noop} />
        )}

        {rows.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
            {rows.map((r, i) => (
              <View
                key={r.label}
                style={[styles.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.background.cardBorder }]}
              >
                <Text style={[styles.label, { color: colors.text.tertiary }]}>{r.label}</Text>
                <Text style={[styles.value, { color: colors.text.primary }]} selectable>{r.value}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.note, { color: colors.text.tertiary }]}>
          {booking.kind === 'boarding_pass'
            ? `${name} shared this flight with the trip. Only ${name} can show the boarding pass.`
            : `${name} shared this with the trip. Only ${name} can change it.`}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: Spacing['5'], paddingBottom: 100, gap: Spacing['4'] },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing['4'] },
  row: { paddingVertical: Spacing['3'], gap: 2 },
  label: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, textTransform: 'uppercase' },
  value: { fontSize: FontSize.md },
  note: { fontSize: 13, lineHeight: 19 },
});
