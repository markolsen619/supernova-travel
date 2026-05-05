import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const FEATURES = [
  {
    icon: '✈️',
    label: 'Unlimited AI Trips',
    description: 'Generate trips with Gemini AI as often as you like',
  },
  {
    icon: '🎬',
    label: '30-Second Clips',
    description: 'Upload up to 30-second travel video clips',
  },
  {
    icon: '🗺️',
    label: 'Collaborative Trips',
    description: 'Invite friends to co-edit your itineraries',
  },
  {
    icon: '🔔',
    label: 'Flight Alerts',
    description: 'Real-time gate change and delay notifications',
  },
  {
    icon: '🧳',
    label: 'Travel Wallet',
    description: 'Boarding passes, reservations, loyalty programs',
  },
  {
    icon: '⭐',
    label: 'Priority Support',
    description: 'Fast-track responses from the Supernova team',
  },
];

export function PaywallFeatureList() {
  const { colors } = useTheme();

  return (
    <View>
      {FEATURES.map((feature) => (
        <View key={feature.label} style={styles.row}>
          <Text style={styles.icon}>{feature.icon}</Text>
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
  icon: {
    fontSize: FontSize.xl,
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
