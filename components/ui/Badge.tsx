import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { CheckCircle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

type BadgeVariant = 'free' | 'pro' | 'business' | 'new' | 'verified';

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  style?: ViewStyle;
}

const LABELS: Record<BadgeVariant, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
  new: 'New',
  verified: 'Verified',
};

// Solid tint + dark text — same pattern as the trip screen's status chips,
// computed for ≥4.5:1 contrast (business 6.59:1; the rest reuse already-
// verified pairs from constants/colors.ts's status tokens).
const PALETTE: Record<BadgeVariant, { bg: string; text: string }> = {
  free: { bg: '', text: '' }, // resolved from theme below (neutral, not a fixed hue)
  pro: { bg: '#FEF3C7', text: '#92400E' },
  business: { bg: '#EDEBFB', text: '#4C46A3' },
  new: { bg: '#DCFCE7', text: '#166534' },
  verified: { bg: '#DBEAFE', text: '#1E40AF' },
};

export function Badge({ variant, label, style }: BadgeProps) {
  const { colors } = useTheme();
  const text = label ?? LABELS[variant];
  const p = variant === 'free'
    ? { bg: colors.background.sunken, text: colors.text.secondary }
    : PALETTE[variant];

  return (
    <View style={[styles.badge, { backgroundColor: p.bg }, style]}>
      {variant === 'verified' && <CheckCircle size={11} color={p.text} weight="fill" />}
      <Text style={[styles.text, { color: p.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing['2'],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.3,
  },
});
