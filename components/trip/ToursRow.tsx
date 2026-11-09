/**
 * Tours & tickets on a trip (owner, 2026-11-08): "Things to do in {city}" per city of an upcoming or current trip, on
 * GetYourGuide (Viator in the US/CA/MX). Opens the partner's search with our affiliate ids; when the traveler comes back,
 * `onReturn` opens "Booked something?" (the partners never tell us what was booked).
 */
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { ArrowUpRight, Ticket } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { activityPartner, partnerIdsFromEnv, PARTNER_NAME, thingsToDoUrl } from '@/utils/activityBooking';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

type City = { index: number; name: string; countryCode: string | null };

const ids = () => partnerIdsFromEnv({
  EXPO_PUBLIC_GYG_PARTNER_ID: process.env.EXPO_PUBLIC_GYG_PARTNER_ID,
  EXPO_PUBLIC_VIATOR_PID: process.env.EXPO_PUBLIC_VIATOR_PID,
  EXPO_PUBLIC_VIATOR_MCID: process.env.EXPO_PUBLIC_VIATOR_MCID,
});

export function ToursRow({ cities, onReturn }: { cities: City[]; onReturn: (city: City, partner: string) => void }) {
  const { colors } = useTheme();
  const open = useCallback(async (c: City) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const partner = PARTNER_NAME[activityPartner(c.countryCode)];
    await WebBrowser.openBrowserAsync(thingsToDoUrl(c.name, c.countryCode, ids())).catch(() => {});
    onReturn(c, partner);
  }, [onReturn]);
  if (!cities.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {cities.map((c) => {
        const partner = PARTNER_NAME[activityPartner(c.countryCode)];
        return (
          <Pressable key={`${c.index}-${c.name}`} onPress={() => open(c)}
            style={[styles.card, cities.length === 1 && styles.single, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
            accessibilityRole="link" accessibilityLabel={`Things to do in ${c.name}, on ${partner}`}>
            <View style={[styles.icon, { backgroundColor: `${ACTIVITY_ICONS.activity.color}1A` }]}><Ticket size={20} weight="duotone" color={ACTIVITY_ICONS.activity.color} /></View>
            <View style={styles.text}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>TOURS & TICKETS</Text>
              <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{`Things to do in ${c.name}`}</Text>
              <Text style={[styles.meta, { color: colors.text.tertiary }]}>{`On ${partner}`}</Text>
            </View>
            <ArrowUpRight size={16} weight="bold" color={colors.text.tertiary} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing['3'], paddingHorizontal: Spacing['5'], paddingVertical: Spacing['2'] },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], width: 290, minHeight: 72, padding: Spacing['3'], borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth },
  single: { width: undefined, minWidth: '100%' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.medium, marginTop: 2 },
  meta: { fontSize: FontSize.sm, marginTop: 1 },
});
