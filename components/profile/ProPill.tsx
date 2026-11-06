/**
 * The plan pill in the profile header, beside Wallet (owner, 2026-11-05: moved from under the photo, in the app's
 * own colours). The star's violet → pink, deepened so white text clears 4.5:1 in both themes (the light-theme brand
 * pair reads 2.6–3.9:1 with white). Not a button.
 */
import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { Tier } from '@/types';

const PILL: [string, string] = ['#6B5FD6', '#C2416F']; // white text 4.96:1 / 4.91:1

export function ProPill({ tier }: { tier: Tier }) {
  if (tier === 'free') return null;
  const label = tier === 'business' ? 'BUSINESS' : 'PRO';
  return (
    <LinearGradient
      colors={PILL}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.pill}
      accessible
      accessibilityRole="text"
      accessibilityLabel={tier === 'business' ? 'Business member' : 'Pro member'}
    >
      <Text style={styles.text}>{label}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pill: { height: 28, paddingHorizontal: Spacing['3'], borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.9, color: '#FFFFFF' },
});
