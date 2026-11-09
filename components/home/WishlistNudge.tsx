/**
 * Home's wish-list nudge (owner, 2026-11-08): with no upcoming trip and saved places, "You saved 6 places in Tokyo ·
 * Plan a trip there" opens the AI form with the city and those places as must-sees. Dismissed per city (on this phone).
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Heart, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import type { topSavedCity } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

type Top = NonNullable<ReturnType<typeof topSavedCity>>;
const key = (city: string) => `wishNudgeDismissed:${city.toLowerCase()}`;

/** Whether the nudge for this city was dismissed on this phone (null while reading). */
export function useNudgeDismissed(city: string | null): [boolean | null, () => void] {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    if (!city) { setDismissed(null); return; }
    AsyncStorage.getItem(key(city)).then((v) => { if (live) setDismissed(v === '1'); }).catch(() => { if (live) setDismissed(false); });
    return () => { live = false; };
  }, [city]);
  const dismiss = useCallback(() => {
    if (!city) return;
    setDismissed(true);
    AsyncStorage.setItem(key(city), '1').catch(() => {});
  }, [city]);
  return [dismissed, dismiss];
}

export function WishlistNudge({ top, countryCode, onDismiss }: { top: Top; countryCode: string | null; onDismiss: () => void }) {
  const { colors } = useTheme();
  const plan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/trip/ai-generate', params: { destination: top.city, countryCode: countryCode ?? '', lat: String(top.lat), lng: String(top.lng), mustSee: top.names.slice(0, 8).join(', ') } });
  }, [top, countryCode]);
  const dismiss = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismiss(); }, [onDismiss]);
  return (
    <View style={[styles.card, { backgroundColor: colors.background.card }]}>
      <Pressable onPress={dismiss} style={styles.close} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Hide the ${top.city} suggestion`}>
        <X size={16} weight="bold" color={colors.text.tertiary} />
      </Pressable>
      <View style={styles.head}>
        <Heart size={18} weight="duotone" color={colors.brand.pink} />
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>FROM YOUR WISH LIST</Text>
      </View>
      <Text style={[styles.title, { color: colors.text.primary }]}>{`You saved ${top.count} ${top.count === 1 ? 'place' : 'places'} in ${top.city}`}</Text>
      <Text style={[styles.body, { color: colors.text.secondary }]} numberOfLines={2}>{top.names.slice(0, 3).join(' · ')}</Text>
      <Button label="Plan a trip there" onPress={plan} fullWidth style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, padding: Spacing['5'], gap: Spacing['1'] },
  close: { position: 'absolute', top: Spacing['2'], right: Spacing['2'], width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.semiBold, letterSpacing: -0.3, marginTop: Spacing['1'], paddingRight: 36 },
  body: { fontSize: FontSize.sm, lineHeight: 19 },
  btn: { marginTop: Spacing['3'] },
});
