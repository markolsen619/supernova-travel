import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Plus, CalendarBlank } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { useReservations } from '@/hooks/useReservations';
import { ReservationCard } from '@/components/wallet/ReservationCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function ReservationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { reservations, isLoading } = useReservations();

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Coming soon', 'Adding reservations manually is coming in a future update.');
  };

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
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <View style={styles.titleGroup}>
          <StarMark size={18} />
          <Text style={[styles.title, { color: colors.text.primary }]}>Reservations</Text>
        </View>
        <TouchableOpacity onPress={handleAdd} style={styles.addButton} accessibilityLabel="Add reservation">
          <Plus size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={{ paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], gap: Spacing['4'] }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} height={120} radius={BorderRadius.xl} />
          ))}
        </View>
      ) : reservations.length === 0 ? (
        <EmptyState
          icon={CalendarBlank}
          title="No reservations yet"
          description="Hotels, cars, and activities you book will show up here."
          actionLabel="Add reservation"
          onAction={handleAdd}
          actionHaptic="none"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
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
        </ScrollView>
      )}
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
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  starIcon: { width: 18, height: 18 },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  addButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
  },
  scroll: {
    flex: 1,
  },
});
