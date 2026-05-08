import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { PAYWALL_FEATURE_ICONS } from '@/constants/icons';

export function PaywallFeatureList() {
  const { colors } = useTheme();

  return (
    <View>
      {PAYWALL_FEATURE_ICONS.map((feature) => (
        <View key={feature.label} style={styles.row}>
          <feature.Icon size={24} color={feature.color} weight="duotone" />
          <View style={styles.textContainer}>
            <Text style={[styles.label, { color: colors.text.primary }]}>
              {feature.label}
            </Text>
            <Text style={[styles.description, { color: colors.text.secondary }]}>
              {feature.description}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingVertical: Spacing['3'],
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  description: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});
