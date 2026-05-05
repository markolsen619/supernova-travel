import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { LoyaltyCard } from '@/components/wallet/LoyaltyCard';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { loyaltyPrograms, isLoading } = useLoyaltyPrograms();

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
        <Text style={[styles.title, { color: colors.text.primary }]}>Loyalty Programs</Text>
        <TouchableOpacity
          onPress={() => router.push('/(wallet)/loyalty/add')}
          style={styles.addButton}
        >
          <Text style={[styles.addText, { color: colors.brand.purple }]}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} size="large" />
        </View>
      ) : loyaltyPrograms.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>⭐</Text>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            No loyalty programs yet. Add your first one.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: Spacing['4'], paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {loyaltyPrograms.map((program) => (
            <LoyaltyCard
              key={program.id}
              program={program}
              onPress={() => router.push(`/(wallet)/loyalty/${program.id}`)}
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
  addButton: {
    width: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  addText: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: FontSize.base,
    textAlign: 'center',
    paddingHorizontal: Spacing['8'],
  },
  scroll: {
    flex: 1,
  },
});
