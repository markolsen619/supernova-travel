/** Home's Get inspired (spec 2026-10-29): the catalog's most popular destinations, swipeable; See all → Explore. */
import { memo, useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import type { Destination as CatalogDestination } from '@/utils/destinations';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export const InspiredStrip = memo(function InspiredStrip({ destinations }: { destinations: CatalogDestination[] }) {
  const { colors } = useTheme();
  const top = useMemo(() => [...destinations].sort((a, b) => b.popularity - a.popularity).slice(0, 8), [destinations]);
  const open = useCallback((slug: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/destination/${slug}`); }, []);
  const seeAll = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate('/(tabs)/explore'); }, []);
  if (top.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Get inspired</Text>
        <Pressable onPress={seeAll} hitSlop={10} style={styles.link} accessibilityRole="button" accessibilityLabel="See all destinations">
          <Text style={[styles.linkText, { color: colors.brand.purple }]}>See all</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {top.map((d) => (
          <Pressable key={d.slug} onPress={() => open(d.slug)} style={[styles.card, { backgroundColor: colors.background.sunken }]} accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.countryName}`}>
            {d.coverImageUrl ? <Image source={{ uri: d.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.shade} />
            <View style={styles.cap}>
              <Text style={styles.capEyebrow} numberOfLines={1}>{d.countryName.toUpperCase()}</Text>
              <Text style={styles.capTitle} numberOfLines={1}>{d.name}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: Spacing['2'], marginHorizontal: -Spacing['5'] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing['5'] },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  row: { gap: Spacing['3'], paddingHorizontal: Spacing['5'] },
  card: { width: 200, height: 240, borderRadius: 18, overflow: 'hidden' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  cap: { position: 'absolute', left: Spacing['3'], right: Spacing['3'], bottom: Spacing['3'], gap: 2 },
  capEyebrow: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 0.9, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  capTitle: { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
});
