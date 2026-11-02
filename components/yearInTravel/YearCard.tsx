/**
 * Home's Year in Travel card (Dec 1 – Jan 15, utils/yearInTravel showYearCard): "See your year", or for someone
 * with no trips that year an invitation to plan one.
 */
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useYearInTravel } from '@/hooks/useYearInTravel';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const YearCard = memo(function YearCard({ year }: { year: number }) {
  const { colors } = useTheme();
  const { data } = useYearInTravel(year);
  const hasTrips = (data?.trips ?? 0) > 0;
  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasTrips) router.push(`/year/${year}` as never);
    else router.navigate('/(tabs)/create');
  }, [hasTrips, year]);
  if (!data) return null;
  return (
    <LinearGradient colors={[colors.brand.purple, colors.brand.pink] as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.border}>
      <Pressable onPress={open} style={[styles.card, { backgroundColor: '#0B0A12' }]} accessibilityRole="button"
        accessibilityLabel={hasTrips ? `See your ${year} in travel` : 'Plan a trip'}>
        <Text style={styles.eyebrow}>{`YOUR ${year} IN TRAVEL`}</Text>
        <Text style={styles.title}>{hasTrips ? `${data.trips} ${data.trips === 1 ? 'trip' : 'trips'}, ${data.countries} ${data.countries === 1 ? 'country' : 'countries'}. Relive it.` : 'Your year in travel starts with one trip'}</Text>
        <View style={styles.cta}><Text style={styles.ctaText}>{hasTrips ? 'See your year' : 'Plan a trip'}</Text></View>
      </Pressable>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  border: { borderRadius: BorderRadius.xl, padding: 1.5 },
  card: { borderRadius: BorderRadius.xl - 1, padding: Spacing['5'], gap: Spacing['2'] },
  eyebrow: { color: '#B9B2F0', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 1.2 },
  title: { color: '#F5F3F9', fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: -0.4 },
  cta: { alignSelf: 'flex-start', marginTop: Spacing['2'], minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#F5F3F9', justifyContent: 'center' },
  ctaText: { color: '#1F1C19', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
