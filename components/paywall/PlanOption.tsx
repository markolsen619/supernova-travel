import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { PlanView } from '@/utils/offerings';

interface PlanOptionProps {
  plan: PlanView;
  selected: boolean;
  onSelect: (id: string) => void;
}

/**
 * One selectable plan row. Selection is a radio group, not a set of buttons —
 * three equal-weight buttons would leave the screen with no hierarchy (design
 * rule 3), so the plans are a choice and the single CTA below acts on it.
 */
export function PlanOption({ plan, selected, onSelect }: PlanOptionProps) {
  const { colors } = useTheme();

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(plan.id);
  }, [onSelect, plan.id]);

  // Selected state is carried by the brand accent — one of its sanctioned
  // uses. Unselected rows stay on a plain hairline so the choice reads at a
  // glance without the screen turning purple.
  const borderColor = selected ? colors.brand.purple : colors.background.cardBorder;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={
        plan.savingsPercent
          ? `${plan.title}, ${plan.priceString}, save ${plan.savingsPercent} percent`
          : `${plan.title}, ${plan.priceString}`
      }
      style={[
        styles.row,
        {
          borderColor,
          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
          backgroundColor: colors.background.card,
        },
      ]}
    >
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.brand.purple : colors.text.disabled,
            backgroundColor: selected ? colors.brand.purple : 'transparent',
          },
        ]}
      >
        {selected && <Check size={12} color={colors.text.inverse} weight="bold" />}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text.primary }]}>{plan.title}</Text>
          {plan.savingsPercent !== null && (
            <View style={[styles.badge, { backgroundColor: `${colors.brand.purple}1F` }]}>
              <Text style={[styles.badgeText, { color: colors.brand.purpleDark }]}>
                Save {plan.savingsPercent}%
              </Text>
            </View>
          )}
        </View>
        {plan.perMonthString !== null && (
          <Text style={[styles.sub, { color: colors.text.tertiary }]}>
            {plan.perMonthString} / month
          </Text>
        )}
        {plan.isLifetime && (
          <Text style={[styles.sub, { color: colors.text.tertiary }]}>One payment, yours forever</Text>
        )}
      </View>

      <Text style={[styles.price, { color: colors.text.primary }]}>{plan.priceString}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    // 44pt minimum touch target, comfortably exceeded.
    minHeight: 64,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing['3'],
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  badge: {
    paddingHorizontal: Spacing['2'],
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.4,
  },
  sub: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  price: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
});
