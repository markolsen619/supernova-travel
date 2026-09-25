import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useCallback } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Bell, CaretRight } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

/** Amber, matching Flight alerts in PAYWALL_FEATURE_ICONS. */
const ACCENT = '#fbbf24';

/**
 * Why a free user's boarding pass never changes status.
 *
 * checkFlightStatus polls paid owners only — a free user's flight is never
 * looked up at all, so the pass sits at "upcoming" until they edit it. Left
 * unsaid that reads as the wallet being broken. Saying it turns a dead end
 * into the one moment where Flight alerts are obviously worth paying for:
 * the user is holding the exact flight the feature applies to.
 *
 * Renders nothing for paid users — not a disabled or "you have this" state,
 * which would be clutter on a screen whose job is the pass itself.
 */
export function FlightStatusUpsell() {
  const { colors } = useTheme();
  const tier = useAuthStore((s) => s.tier);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/paywall');
  }, []);

  if (tier !== 'free') return null;

  return (
    <TouchableOpacity
      style={[
        styles.row,
        { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
      ]}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Track this flight automatically with Supernova Pro"
    >
      <View style={[styles.iconBubble, { backgroundColor: `${ACCENT}1A` }]}>
        <Bell size={22} color={ACCENT} weight="duotone" />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>SUPERNOVA PRO</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Track this flight automatically
        </Text>
        <Text style={[styles.body, { color: colors.text.secondary }]}>
          Boarding, landing and cancellation alerts, checked for you.
        </Text>
      </View>

      <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['4'],
    marginHorizontal: Spacing['5'],
    marginTop: Spacing['5'],
    padding: Spacing['4'],
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  body: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.4,
  },
});
