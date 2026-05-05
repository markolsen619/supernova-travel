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
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { LoyaltyCard } from '@/components/wallet/LoyaltyCard';
import { PointsBalance } from '@/components/wallet/PointsBalance';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  airline: 'Airline',
  hotel: 'Hotel',
  car_rental: 'Car Rental',
  credit_card: 'Credit Card',
  other: 'Other',
};

function formatExpiryDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function LoyaltyDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loyaltyPrograms, deleteProgram } = useLoyaltyPrograms();

  const program = loyaltyPrograms.find((p) => p.id === id);

  const handleDelete = () => {
    Alert.alert(
      'Delete Loyalty Program',
      'Are you sure you want to delete this loyalty program?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (program) {
              deleteProgram.mutate(program.id, {
                onSuccess: () => router.back(),
              });
            }
          },
        },
      ],
    );
  };

  if (!program) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backText, { color: colors.brand.purple }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text.primary }]}>Loyalty Program</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.notFoundText, { color: colors.text.tertiary }]}>
            Loyalty program not found.
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
        <Text style={[styles.title, { color: colors.text.primary }]}>Loyalty Program</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: Spacing['4'], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Card preview */}
        <LoyaltyCard program={program} onPress={() => {}} />

        {/* Balance highlight */}
        <View
          style={[
            styles.balanceSection,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>Balance</Text>
          <PointsBalance balance={program.balance} unit={program.unit} tier={program.tier} />
        </View>

        {/* Details section */}
        <View
          style={[
            styles.detailsSection,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
        >
          <Text style={[styles.programNameLarge, { color: colors.text.primary }]}>
            {program.programName}
          </Text>

          <View
            style={[styles.typeBadge, { backgroundColor: colors.background.primary, borderColor: colors.background.cardBorder }]}
          >
            <Text style={[styles.typeBadgeText, { color: colors.brand.purple }]}>
              {PROGRAM_TYPE_LABELS[program.programType]}
            </Text>
          </View>

          {program.memberNumber ? (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Member Number</Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {program.memberNumber}
              </Text>
            </View>
          ) : null}

          {program.expiryDate ? (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Expires</Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {formatExpiryDate(program.expiryDate)}
              </Text>
            </View>
          ) : null}

          {program.isManual ? (
            <Text style={[styles.manualIndicator, { color: colors.text.tertiary }]}>
              Manually entered
            </Text>
          ) : null}
        </View>

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete Loyalty Program
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  balanceSection: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['3'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailsSection: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['3'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['4'],
    gap: Spacing['3'],
  },
  programNameLarge: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1'],
  },
  typeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  detailValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  manualIndicator: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
    marginTop: Spacing['1'],
  },
  deleteButton: {
    marginHorizontal: Spacing['4'],
    marginTop: Spacing['2'],
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
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
