import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Plus, Star } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { LoyaltyCard } from '@/components/wallet/LoyaltyCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { loyaltyPrograms, isLoading } = useLoyaltyPrograms();

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(wallet)/loyalty/add');
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
          <Image source={require('@/assets/images/SupernovaStar.png')} style={styles.starIcon} resizeMode="contain" />
          <Text style={[styles.title, { color: colors.text.primary }]}>Loyalty programs</Text>
        </View>
        <TouchableOpacity
          onPress={handleAdd}
          style={styles.addButton}
          accessibilityLabel="Add loyalty program"
        >
          <Plus size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} size="large" />
        </View>
      ) : loyaltyPrograms.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No loyalty programs yet"
          description="Track your miles, points, and status in one place."
          actionLabel="Add program"
          onAction={handleAdd}
          actionHaptic="none"
        />
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
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/(wallet)/loyalty/${program.id}`);
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
