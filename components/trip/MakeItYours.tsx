/**
 * "Make it yours" (owner, 2026-11-05) under a trip's title: on someone else's trip, copy its cities, days and places
 * into a private trip of your own (utils/tripCopy.ts — nothing personal comes along), with a start date or "Decide
 * later"; on a copy you own, the credit line "Based on Alice's trip" (opens the original).
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CopySimple } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
import { DateRangeSheet } from '@/components/ui/DateRangeSheet';
import { copyTrip } from '@/services/tripCopy';
import { openCreatedTrip } from '@/services/openCreatedTrip';
import { canCopyTrip } from '@/utils/tripCopy';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';
import type { TripWithDays } from '@/types';

export function MakeItYours({ trip, authorName }: { trip: TripWithDays; authorName: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const [asking, setAsking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = trip.isEditorial ? 'Supernova' : authorName.split(' ')[0] || authorName;

  const open = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setError(null); setAsking(true); }, []);
  const close = useCallback(() => { if (!copying) setAsking(false); }, [copying]);
  const run = useCallback(async (start: Date | null) => {
    setPicking(false);
    setCopying(true);
    setError(null);
    try {
      const id = await copyTrip(trip, name, start);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAsking(false);
      openCreatedTrip(id);
    } catch (e) {
      // Offline already says so itself (requireOnline's alert).
      setError((e as Error).message === 'offline' ? null : "Couldn't copy this trip. Try again.");
    } finally {
      setCopying(false);
    }
  }, [trip, name]);
  const pickDate = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPicking(true); }, []);
  const decideLater = useCallback(() => run(null), [run]);
  const confirmDates = useCallback((start: Date) => run(start), [run]);
  const cancelDates = useCallback(() => setPicking(false), []);
  const openOriginal = useCallback(() => {
    if (!trip.copiedFrom) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.copiedFrom.tripId}`);
  }, [trip.copiedFrom]);

  // Your own copy: the credit line.
  if (uid && trip.authorUid === uid) {
    if (!trip.copiedFrom) return null;
    return (
      <Pressable onPress={openOriginal} style={styles.credit} accessibilityRole="link" accessibilityLabel={`Based on ${trip.copiedFrom.authorName}'s trip. Open it`}>
        <CopySimple size={14} weight="bold" color={colors.text.tertiary} />
        <Text style={[styles.creditText, { color: colors.text.tertiary }]}>{`Based on ${trip.copiedFrom.authorName}'s trip`}</Text>
      </Pressable>
    );
  }
  if (!canCopyTrip(trip, uid)) return null;

  const dayCount = trip.days.length;
  return (
    <>
      <Pressable
        onPress={open}
        style={[styles.button, { borderColor: colors.background.cardBorder, backgroundColor: colors.background.card }]}
        accessibilityRole="button"
        accessibilityLabel="Make it yours: copy this trip's places into a new trip"
      >
        <CopySimple size={18} weight="bold" color={colors.text.primary} />
        <Text style={[styles.buttonText, { color: colors.text.primary }]}>Make it yours</Text>
      </Pressable>

      <Modal visible={asking} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.background.primary, paddingBottom: insets.bottom + Spacing['5'] }]}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{`${dayCount} ${dayCount === 1 ? 'DAY' : 'DAYS'} · ${trip.days.reduce((n, d) => n + d.activities.length, 0)} STOPS`}</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>Make it yours</Text>
          <Text style={[styles.body, { color: colors.text.secondary }]}>
            {`Copies ${name}'s cities, days and places into a private trip you can change however you like. Their dates, notes, photos and bookings stay with them.`}
          </Text>
          {error ? <Text style={[styles.body, { color: colors.semantic.error }]}>{error}</Text> : null}
          {copying ? (
            <View style={styles.busy}><ActivityIndicator color={colors.text.secondary} /><Text style={[styles.body, { color: colors.text.secondary }]}>Copying the trip</Text></View>
          ) : (
            <View style={styles.actions}>
              <Button label="Pick a start date" onPress={pickDate} fullWidth />
              <Pressable onPress={decideLater} style={styles.link} accessibilityRole="button" accessibilityLabel="Copy without dates. Decide later">
                <Text style={[styles.linkText, { color: colors.text.secondary }]}>Decide later</Text>
              </Pressable>
            </View>
          )}
        </View>
        <DateRangeSheet visible={picking} start={null} end={null} fixedDays={dayCount} minDate={new Date()} onConfirm={confirmDates} onCancel={cancelDates} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'], minHeight: 44, marginHorizontal: Spacing['5'], marginTop: Spacing['3'], borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth },
  buttonText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  credit: { flexDirection: 'row', alignItems: 'center', gap: Spacing['1'], minHeight: 44, paddingHorizontal: Spacing['5'] },
  creditText: { fontSize: FontSize.sm },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing['5'], paddingTop: Spacing['6'], borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, gap: Spacing['2'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  body: { fontSize: FontSize.base, lineHeight: 22 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 56 },
  actions: { marginTop: Spacing['3'], gap: Spacing['1'] },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
