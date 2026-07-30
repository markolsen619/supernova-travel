import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CalendarX } from 'phosphor-react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { useReservations } from '@/hooks/useReservations';
import { RESERVATION_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { ReservationType } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const TYPE_LABELS: Record<ReservationType, string> = {
  hotel: 'Hotel',
  airbnb: 'Airbnb',
  rental_car: 'Rental car',
  restaurant: 'Restaurant',
  activity: 'Activity',
  show: 'Show',
};

function formatDate(isoDate?: string): string {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export default function ReservationDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reservations, deleteReservation } = useReservations();

  const reservation = reservations.find((r) => r.id === id);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(wallet)/reservation/add?id=${id}`);
  }, [id]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete reservation',
      'Are you sure you want to delete this reservation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (id) {
              deleteReservation.mutate(id, {
                onSuccess: () => router.back(),
              });
            }
          },
        },
      ],
    );
  }, [id, deleteReservation]);

  if (!reservation) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <WalletHeader title="Reservation" onBack={handleBack} />
        <View style={styles.centered}>
          <EmptyState
            icon={CalendarX}
            title="This reservation isn't here"
            description="It may have been deleted or the link is out of date."
            actionLabel="Back to wallet"
            onAction={handleBack}
            actionHaptic="none"
          />
        </View>
      </View>
    );
  }

  const { Icon: TypeIcon, color: typeColor } = RESERVATION_ICONS[reservation.type];

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader title="Reservation" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.background.card,
              borderColor: colors.background.cardBorder,
            },
          ]}
        >
          <TypeIconBubble Icon={TypeIcon} color={typeColor} bubbleSize={64} iconSize={32} />
          <Text style={[styles.heroTitle, { color: colors.text.primary }]}>
            {reservation.title}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}1F` }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>
              {TYPE_LABELS[reservation.type]}
            </Text>
          </View>
        </View>

        {/* Confirmation code */}
        <View
          style={[
            styles.detailCard,
            {
              backgroundColor: colors.background.card,
              borderColor: colors.background.cardBorder,
            },
          ]}
        >
          <DetailRow
            label="Confirmation code"
            value={reservation.confirmationCode}
            valueStyle={{ color: colors.brand.purple, fontWeight: FontWeight.bold }}
            colors={colors}
            borderColor={colors.background.cardBorder}
          />
          {reservation.checkIn ? (
            <DetailRow label="Check-in" value={formatDate(reservation.checkIn)} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.checkOut ? (
            <DetailRow label="Check-out" value={formatDate(reservation.checkOut)} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.address ? (
            <DetailRow label="Address" value={reservation.address} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.notes ? (
            <DetailRow label="Notes" value={reservation.notes} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
        </View>

        {/* Edit button */}
        <TouchableOpacity
          style={[
            styles.editButton,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
          onPress={handleEdit}
          activeOpacity={0.8}
        >
          <Text style={[styles.editButtonText, { color: colors.text.primary }]}>
            Edit reservation
          </Text>
        </TouchableOpacity>

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete reservation
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  valueStyle?: object;
  colors: { text: { primary: string; secondary: string; tertiary: string } };
  borderColor: string;
}

function DetailRow({ label, value, valueStyle, colors, borderColor }: DetailRowProps) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: borderColor }]}>
      <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text.primary }, valueStyle]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  heroCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['6'],
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  typeBadge: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1'],
    borderRadius: BorderRadius.full,
  },
  typeBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  detailCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginBottom: Spacing['4'],
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing['3'],
  },
  detailLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 0,
    minWidth: 120,
  },
  detailValue: {
    fontSize: FontSize.base,
    flex: 1,
    textAlign: 'right',
  },
  editButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
    marginTop: Spacing['2'],
  },
  editButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
    marginTop: Spacing['3'],
  },
  deleteButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
