import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius } from '@/constants/spacing';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  bordered?: boolean;
}

/**
 * A clean surface card — solid fill + hairline border, no blur.
 *
 * This used to be a frosted BlurView over a translucent fill, which only
 * reads as "glass" against dark, busy backgrounds (the void/starfield).
 * `colors.background.card` is now a fully opaque `#FFFFFF` on light chrome,
 * so the blur had nothing translucent to show through — it was inert, not
 * "decorative mush," just wasted GPU work sitting on top of a flat white
 * card. The skill's own anti-pattern list is explicit here too: cards with
 * borders AND shadows AND fills should pick one — this picks fill + hairline,
 * the same pattern already used for chips and the reference trip screen.
 * (No current call sites reference this component; the decision is safe to
 * make outright rather than needing a migration.)
 */
export function GlassCard({ children, style, bordered = true }: GlassCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background.card },
        bordered && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.background.cardBorder },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
});
