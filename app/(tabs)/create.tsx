import { useCallback } from 'react';
import { Platform, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarPlus, Sparkle, Compass, Images, Camera, CaretRight } from 'phosphor-react-native';
import { pastTripsSupported } from '@/utils/pastTrip';
import type { PhosphorIcon } from '@/constants/icons';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { useAuthStore } from '@/stores/useAuthStore';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { ScreenHeaderStar } from '@/components/ui/ScreenHeaderStar';

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
      title: 'Plan it yourself',
      description: 'Build your own itinerary day by day',
      onPress: () => router.push('/trip/new'),
    },
    // iPhone only for now (utils/pastTrip pastTripsSupported).
    ...(pastTripsSupported(Platform.OS) ? [{
      Icon: Images,
      iconColor: colors.brand.pink,
      title: "Add a trip you've taken",
      description: 'Turn your photos into a trip',
      onPress: () => router.push('/trip/past'),
    }] : []),
    {
      Icon: Camera,
      iconColor: colors.accent.teal,
      title: 'Share a photo or video',
      description: 'Post a moment to Explore',
      onPress: () => router.push('/add-to-feed'),
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
      {/* Same header as Explore, Profile and Wallet: the brand star beside the title. */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ScreenHeaderStar />
          <Text style={[styles.title, { color: colors.text.primary }]}>Create a trip</Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Plan it with AI or build it yourself</Text>
      </View>

      <ScrollView contentContainerStyle={styles.cardsWrapper} showsVerticalScrollIndicator={false}>
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
              {tier === 'free' ? 'One AI trip a month with Gemini' : 'Unlimited AI trips with Gemini'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── The other ways in: full width like the hero, stacked (owner, 2026-10-30) ── */}
        {secondaryOptions.map((opt) => (
          <TouchableOpacity
            key={opt.title}
            style={[styles.optionCard, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
            onPress={() => handleOptionPress(opt.onPress)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${opt.title}. ${opt.description}`}
          >
            <View style={[styles.optionIconBubble, { backgroundColor: `${opt.iconColor}1A` }]}>
              <opt.Icon size={24} color={opt.iconColor} weight="duotone" />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>{opt.title}</Text>
              <Text style={[styles.optionDesc, { color: colors.text.secondary }]}>{opt.description}</Text>
            </View>
            <CaretRight size={18} color={colors.text.tertiary} weight="bold" />
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  subtitle: {
    fontSize: FontSize.sm,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  cardsWrapper: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    paddingBottom: 120,
    gap: Spacing['3'],
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

  // ── The other options: full width, stacked ──
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['4'],
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['4'],
    minHeight: 76,
  },
  optionIconBubble: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  optionDesc: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.4,
  },
});
