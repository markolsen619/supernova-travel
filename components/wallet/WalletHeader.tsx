import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeaderStar } from '@/components/ui/ScreenHeaderStar';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

interface WalletHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: { icon: PhosphorIcon; onPress: () => void; label: string };
  /**
   * Small tracked-out label above the title — the app's editorial signature
   * (`JUL 25 – 30 · 6 DAYS` over a big title). Optional: a screen with no
   * metadata worth stating is better with nothing than with a filler word.
   */
  eyebrow?: string;
}

// The back/star/title/[action] header every wallet screen used to hand-roll
// identically (see the pre-redesign wallet list/detail screens) — one
// shared component instead of an 8th, 9th, 10th copy.
//
// Two rows, not one. The title used to sit inline between the back button and
// the right action, which capped it at FontSize.lg (19) and a StarMark of 18
// — visibly smaller than every other screen title in the app, which run
// FontSize['2xl'] (26) with -0.02em tracking. Giving the title its own row
// lets it match, and lets the star scale with it. Horizontal padding also
// moves to the design system's 20/24 rather than 16, which was under the
// 20px screen-margin floor.
export function WalletHeader({ title, onBack, rightAction, eyebrow }: WalletHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const RightIcon = rightAction?.icon;

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + Spacing['2'], borderBottomColor: colors.background.cardBorder },
      ]}
    >
      {/* Navigation row — 44pt targets, held apart from the title so neither
          constrains the other. */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={22} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>

        {rightAction && RightIcon ? (
          <TouchableOpacity
            onPress={rightAction.onPress}
            style={styles.rightButton}
            accessibilityLabel={rightAction.label}
          >
            <RightIcon size={22} color={colors.text.primary} weight="bold" />
          </TouchableOpacity>
        ) : (
          <View style={styles.rightButton} />
        )}
      </View>

      <View style={styles.titleBlock}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{eyebrow}</Text>
        ) : null}
        <View style={styles.titleRow}>
          {/* The shared mark, not a literal size — Explore and Profile use
              the same component, and a hand-typed number here is exactly how
              this drifted to 26 against their 70 in the first place. */}
          <ScreenHeaderStar />
          <Text
            style={[styles.title, { color: colors.text.primary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    // Generous, deliberately: the old 16 left the title crowding whatever
    // sat under it. Screens add their own content padding on top of this.
    paddingBottom: Spacing['6'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['5'],
  },
  backButton: { width: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  rightButton: { width: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  titleBlock: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['1'],
    gap: Spacing['1'],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
  },
  title: {
    flex: 1,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
});
