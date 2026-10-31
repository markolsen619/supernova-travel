/** Home with no trips ahead (spec 2026-10-29): one primary action, Plan a trip → the Create tab. */
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const PlanCard = memo(function PlanCard() {
  const { colors } = useTheme();
  const plan = useCallback(() => router.navigate('/(tabs)/create'), []);
  return (
    <View style={[styles.card, { backgroundColor: colors.background.card }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Plan your next trip</Text>
      <Text style={[styles.body, { color: colors.text.secondary }]}>Build it with Nova in a minute, or day by day.</Text>
      <Button label="Plan a trip" onPress={plan} fullWidth style={styles.btn} />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, padding: Spacing['5'], gap: Spacing['2'] },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.semiBold, letterSpacing: -0.4 },
  body: { fontSize: FontSize.base, lineHeight: 22 },
  btn: { marginTop: Spacing['2'] },
});
