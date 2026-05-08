import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Reservation } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { RESERVATION_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';

interface ReservationCardProps {
  reservation: Reservation;
  onPress: () => void;
}

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
  const { Icon, color } = RESERVATION_ICONS[reservation.type];

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
      <TypeIconBubble Icon={Icon} color={color} bubbleSize={44} iconSize={24} />

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
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
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
