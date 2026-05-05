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
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function BoardingPassesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { boardingPasses, isLoading } = useBoardingPasses();

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
        <Text style={[styles.title, { color: colors.text.primary }]}>Boarding Passes</Text>
        <TouchableOpacity
          onPress={() => router.push('/(wallet)/boarding-pass/add')}
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
      ) : boardingPasses.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>✈️</Text>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            No boarding passes yet.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: Spacing['4'], paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {boardingPasses.map((pass) => (
            <BoardingPassCard
              key={pass.id}
              pass={pass}
              onPress={() => router.push(`/(wallet)/boarding-pass/${pass.id}`)}
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
  },
  scroll: {
    flex: 1,
  },
});
