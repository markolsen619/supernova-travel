import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarPlus, Sparkle, Compass } from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { useAuthStore } from '@/stores/useAuthStore';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';

interface SecondaryOption {
  Icon: PhosphorIcon;
  iconColor: string;
  title: string;
  description: string;
  onPress: () => void;
}

// AI Generate is the app's differentiated feature — it gets the one brand-
// gradient hero CTA on this screen (SKILL.md: "at most one hero CTA per
// flow"). Manual and Get Inspired are real, equally-functional paths, but
// visually subordinate — three identical cards had no hierarchy at all.
export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { tier } = useAuthStore();

  const handleOptionPress = useCallback((onPress: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }, []);

  const secondaryOptions: SecondaryOption[] = [
    {
      Icon: CalendarPlus,
      iconColor: colors.brand.blue,
      title: 'Manual trip',
      description: 'Build your own itinerary day by day',
      onPress: () => router.push('/trip/new'),
    },
    {
      Icon: Compass,
      iconColor: colors.accent.amber,
      title: 'Get inspired',
      description: 'See where others are traveling',
      onPress: () => router.navigate('/(tabs)/explore'),
    },
  ];

  return (
    <ScreenEntrance>
    <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>NEW TRIP</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>Create a trip</Text>
      </View>

      <View style={styles.cardsWrapper}>
        {/* ── Hero: AI Generate ── */}
        <TouchableOpacity
          onPress={() => handleOptionPress(() => router.push('/trip/ai-generate'))}
          activeOpacity={0.88}
          accessibilityLabel="Generate a trip with AI"
        >
          <LinearGradient
            colors={colors.gradient.purplePink}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroIconBubble}>
              <Sparkle size={26} color="#fff" weight="duotone" />
            </View>
            <Text style={styles.heroTitle}>Generate with AI</Text>
            <Text style={styles.heroDesc}>
              {tier === 'free' ? '1 free trip per week with Gemini AI' : 'Unlimited AI trips with Gemini AI'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Secondary options ── */}
        <View style={styles.secondaryRow}>
          {secondaryOptions.map((opt) => (
            <TouchableOpacity
              key={opt.title}
              style={[styles.optionCard, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
              onPress={() => handleOptionPress(opt.onPress)}
              activeOpacity={0.75}
              accessibilityLabel={opt.title}
            >
              <View style={[styles.optionIconBubble, { backgroundColor: `${opt.iconColor}1A` }]}>
                <opt.Icon size={22} color={opt.iconColor} weight="duotone" />
              </View>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>{opt.title}</Text>
              <Text style={[styles.optionDesc, { color: colors.text.secondary }]}>{opt.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['6'],
    paddingBottom: Spacing['2'],
    gap: Spacing['1'],
  },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  cardsWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing['6'],
    paddingBottom: 120,
    gap: Spacing['4'],
  },

  // ── Hero card ──
  heroCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing['6'],
  },
  heroIconBubble: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['4'],
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: '#fff',
    marginBottom: 4,
  },
  heroDesc: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Secondary options ──
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  optionCard: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing['4'],
  },
  optionIconBubble: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['3'],
  },
  optionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs * 1.4,
  },
});
