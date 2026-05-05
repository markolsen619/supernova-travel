import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useReservations } from '@/hooks/useReservations';
import { ReservationType } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const TYPE_ICONS: Record<ReservationType, string> = {
  hotel: '🏨',
  airbnb: '🏡',
  rental_car: '🚗',
  restaurant: '🍽️',
  activity: '🎯',
};

const TYPE_LABELS: Record<ReservationType, string> = {
  hotel: 'Hotel',
  airbnb: 'Airbnb',
  rental_car: 'Rental Car',
  restaurant: 'Restaurant',
  activity: 'Activity',
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
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reservations, deleteReservation } = useReservations();

  const reservation = reservations.find((r) => r.id === id);

  const handleDelete = () => {
    Alert.alert(
      'Delete Reservation',
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
  };

  if (!reservation) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Spacing['4'],
              borderBottomColor: colors.background.cardBorder,
            },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backText, { color: colors.brand.purple }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text.primary }]}>Reservation</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.notFoundText, { color: colors.text.tertiary }]}>
            Reservation not found.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing['4'],
            borderBottomColor: colors.background.cardBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.brand.purple }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Reservation</Text>
        <View style={styles.backButton} />
      </View>

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
          <Text style={styles.typeIcon}>{TYPE_ICONS[reservation.type]}</Text>
          <Text style={[styles.heroTitle, { color: colors.text.primary }]}>
            {reservation.title}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: colors.background.cardBorder }]}>
            <Text style={[styles.typeBadgeText, { color: colors.text.secondary }]}>
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
            label="Confirmation Code"
            value={reservation.confirmationCode}
            valueStyle={{ color: colors.brand.purple, fontWeight: FontWeight.bold }}
            colors={colors}
            borderColor={colors.background.cardBorder}
          />
          {reservation.checkIn ? (
            <DetailRow label="Check-In" value={formatDate(reservation.checkIn)} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.checkOut ? (
            <DetailRow label="Check-Out" value={formatDate(reservation.checkOut)} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.address ? (
            <DetailRow label="Address" value={reservation.address} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.notes ? (
            <DetailRow label="Notes" value={reservation.notes} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
        </View>

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete Reservation
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
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
  typeIcon: {
    fontSize: 48,
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
  deleteButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
    marginTop: Spacing['2'],
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
  notFoundText: {
    fontSize: FontSize.base,
  },
});
