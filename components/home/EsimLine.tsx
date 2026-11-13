import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SimCard, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { esimHomeLine } from '@/utils/esim';
import { homeRegion } from '@/utils/homeRegion';
import { toCalendarDate } from '@/utils/calendarDate';
import type { Trip } from '@/types';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';

const key = (tripId: string) => `esimLineDismissed:${tripId}`;

/** Whether this trip's eSIM line was hidden on this phone (null while reading; a failed read counts as not hidden). */
function useEsimDismissed(tripId: string): [boolean | null, () => void] {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    setDismissed(null);
    AsyncStorage.getItem(key(tripId)).then((v) => { if (live) setDismissed(v === '1'); }).catch(() => { if (live) setDismissed(false); });
    return () => { live = false; };
  }, [tripId]);
  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(key(tripId), '1').catch(() => {});
  }, [tripId]);
  return [dismissed, dismiss];
}

/**
 * eSIMs (spec docs/superpowers/specs/2026-11-12-trip-extras-design.md): in the week before (or during) an
 * international trip, one line under Home's trip card — opens the trip's Before you go sheet; ✕ hides it for the trip.
 */
export const EsimLine = memo(function EsimLine({ trip }: { trip: Trip }) {
  const { colors } = useTheme();
  const [dismissed, dismiss] = useEsimDismissed(trip.id);
  const line = useMemo(
    () => (dismissed === null ? null : esimHomeLine(trip as never, toCalendarDate(new Date()), true, homeRegion(Intl.DateTimeFormat().resolvedOptions().locale), dismissed)),
    [trip, dismissed],
  );
  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/trip/[id]', params: { id: trip.id, beforeYouGo: '1' } });
  }, [trip.id]);
  const hide = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dismiss(); }, [dismiss]);
  if (!line) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.background.card }]}>
      <Pressable onPress={open} style={styles.main} accessibilityRole="button" accessibilityLabel={`${line.label}. Open Before you go`}>
        <SimCard size={16} color={colors.text.secondary} weight="duotone" />
        <Text style={[styles.text, { color: colors.text.primary }]} numberOfLines={2}>{line.label}</Text>
      </Pressable>
      <TouchableOpacity onPress={hide} style={styles.close} accessibilityRole="button" accessibilityLabel="Hide eSIM suggestion">
        <X size={14} color={colors.text.tertiary} weight="bold" />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.xl, paddingLeft: Spacing['4'], minHeight: 44 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingVertical: Spacing['3'] },
  text: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
