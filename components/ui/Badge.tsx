import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';
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
  verified: '✓ Verified',
};

const COLORS: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  free: { bg: 'rgba(255,255,255,0.08)', text: Colors.text.secondary, border: 'rgba(255,255,255,0.15)' },
  pro: { bg: 'rgba(251,191,36,0.15)', text: Colors.accent.amber, border: 'rgba(251,191,36,0.4)' },
  business: { bg: 'rgba(167,139,250,0.15)', text: Colors.brand.purple, border: 'rgba(167,139,250,0.4)' },
  new: { bg: 'rgba(52,211,153,0.15)', text: Colors.accent.teal, border: 'rgba(52,211,153,0.4)' },
  verified: { bg: 'rgba(96,165,250,0.15)', text: Colors.brand.blue, border: 'rgba(96,165,250,0.4)' },
};

export function Badge({ variant, label, style }: BadgeProps) {
  const colors = COLORS[variant];
  const text = label ?? LABELS[variant];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing['2'],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.3,
  },
});
