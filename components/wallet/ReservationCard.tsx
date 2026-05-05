import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Reservation, ReservationType } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface ReservationCardProps {
  reservation: Reservation;
  onPress: () => void;
}

const TYPE_ICONS: Record<ReservationType, string> = {
  hotel: '🏨',
  airbnb: '🏡',
  rental_car: '🚗',
  restaurant: '🍽️',
  activity: '🎯',
};

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

export function ReservationCard({ reservation, onPress }: ReservationCardProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.background.card,
          borderBottomColor: colors.background.cardBorder,
        },
      ]}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: colors.background.cardBorder }]}>
        <Text style={styles.icon}>{TYPE_ICONS[reservation.type]}</Text>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <Text
          style={[styles.title, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {reservation.title}
        </Text>
        <Text style={[styles.confirmationCode, { color: colors.text.tertiary }]}>
          {reservation.confirmationCode}
        </Text>
      </View>

      {/* Right side: check-in date */}
      {reservation.checkIn ? (
        <View style={styles.dateBlock}>
          <Text style={[styles.dateText, { color: colors.text.secondary }]}>
            {formatDate(reservation.checkIn)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    borderBottomWidth: 1,
    gap: Spacing['3'],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: FontSize.xl,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  confirmationCode: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.5,
  },
  dateBlock: {
    alignItems: 'flex-end',
  },
  dateText: {
    fontSize: FontSize.sm,
  },
});
