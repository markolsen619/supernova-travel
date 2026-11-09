/**
 * "Booked something? Add it to your trip" (owner, 2026-11-08) — shown when the traveler comes back from GetYourGuide or
 * Viator, which never tell us what was booked. From a city's card: what, which day, the time → a new stop. From a
 * stop's Tickets link: the time → that stop marked booked. Either way, optionally the same booking in the wallet
 * (ticked by default; Pro trip matching links it).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { useReservations } from '@/hooks/useReservations';
import { useBookingMatch } from '@/hooks/useBookingMatch';
import { useWalletAllowance } from '@/hooks/useWalletAllowance';
import { requireOnline } from '@/services/offline';
import { Button } from '@/components/ui/Button';
import { isPaidTier } from '@/utils/proFeatures';
import { bookedReservation, bookedStop, dayDateFor, normalizeTime, walletSaveAllowed } from '@/utils/tripTours';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';
import type { TripActivity } from '@/types';

export type BookedTarget =
  | { mode: 'new'; city: string; countryCode: string | null; partner: string; dayIndex: number }
  | { mode: 'stop'; city: string; countryCode: string | null; partner: string; dayId: string; activity: TripActivity };

type Day = { id: string; dayNumber: number };

const dayLabel = (d: Day, startDay: string | null) => {
  const date = dayDateFor(startDay, d.dayNumber);
  if (!date) return `Day ${d.dayNumber}`;
  const [y, m, dd] = date.split('-').map(Number);
  return `Day ${d.dayNumber} · ${new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
};

export function BookedSomethingSheet({ target, tripId, days, startDay, onClose }: {
  target: BookedTarget | null; tripId: string; days: Day[]; startDay: string | null; onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const tier = useAuthStore((s) => s.tier);
  const { addActivity, updateActivity } = useCreateTrip();
  const { addReservation } = useReservations();
  const { afterSave } = useBookingMatch();
  const [name, setName] = useState('');
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState('');
  const [toWallet, setToWallet] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canAdd } = useWalletAllowance();
  // The stop is saved once per opening, so a retry after a wallet failure never adds it twice (final review).
  const stopSaved = useRef(false);
  const daysRef = useRef(days);
  daysRef.current = days;

  // Reset only when the sheet opens for a new target — a re-render of the trip page used to wipe what was typed.
  useEffect(() => {
    if (!target) return;
    stopSaved.current = false;
    setName(target.mode === 'stop' ? target.activity.title : '');
    setDayIndex(target.mode === 'new' ? target.dayIndex : Math.max(0, daysRef.current.findIndex((d) => d.id === target.dayId)));
    setTime(target.mode === 'stop' ? target.activity.startTime ?? '' : '');
    setToWallet(true);
    setError(null);
  }, [target]);

  const dayForWallet = days[dayIndex] ? dayDateFor(startDay, days[dayIndex].dayNumber) : null;
  const walletOk = walletSaveAllowed({ date: dayForWallet, canAdd });

  const save = useCallback(async () => {
    if (!target || !uid || !requireOnline()) return;
    const what = name.trim();
    if (!what) { setError('Add what you booked.'); return; }
    const t = time.trim() ? normalizeTime(time) : null;
    if (time.trim() && !t) { setError('Use a time like 9:30 or 7:30 pm.'); return; }
    const day = days[dayIndex];
    if (!day) { setError('Add a day to this trip first.'); return; }
    setSaving(true); setError(null);
    try {
      if (!stopSaved.current) {
        if (target.mode === 'stop') {
          await updateActivity(tripId, target.dayId, target.activity.id, { ...(t ? { startTime: t } : {}), bookedVia: target.partner, notes: target.activity.notes?.trim() ? target.activity.notes : `Booked on ${target.partner}` });
        } else {
          await addActivity(tripId, day.id, { ...bookedStop({ name: what, city: target.city, time: t, partner: target.partner }), createdAt: Timestamp.now() } as Omit<TripActivity, 'id' | 'order'>);
        }
        stopSaved.current = true;
      }
      if (toWallet && walletOk) {
        const id = await addReservation.mutateAsync(bookedReservation({
          name: what, date: dayDateFor(startDay, day.dayNumber), time: t, city: target.city, countryCode: target.countryCode,
          partner: target.partner, ownerUid: uid, nowIso: new Date().toISOString(),
        }) as never);
        if (isPaidTier(tier)) afterSave('reservation', id).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      setError(stopSaved.current ? "It's on your trip. The wallet copy didn't save — try again, or turn it off." : "Couldn't add it. Try again.");
    } finally {
      setSaving(false);
    }
  }, [target, uid, name, time, days, dayIndex, toWallet, walletOk, tripId, startDay, tier, addActivity, updateActivity, addReservation, afterSave, onClose]);

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fill}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.background.primary, paddingBottom: insets.bottom + Spacing['4'] }]}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{`BACK FROM ${target?.partner.toUpperCase() ?? ''}`}</Text>
            <Text style={[styles.title, { color: colors.text.primary }]}>{target?.mode === 'stop' ? `Booked ${target.activity.title}?` : 'Booked something?'}</Text>
            <Text style={[styles.body, { color: colors.text.secondary }]}>
              {target?.mode === 'stop'
                ? 'Add the time and it shows on the stop.'
                : `Add it to your trip.${isPaidTier(tier) ? '' : ' Pro adds bookings for you when you forward the confirmation email.'}`}
            </Text>

            {target?.mode === 'new' ? (
              <>
                <Text style={[styles.label, { color: colors.text.secondary }]}>What you booked</Text>
                <TextInput value={name} onChangeText={setName} placeholder={`A tour or ticket in ${target.city}`} placeholderTextColor={colors.text.tertiary}
                  style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]} accessibilityLabel="What you booked" />
                <Text style={[styles.label, { color: colors.text.secondary }]}>Which day</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
                  {days.map((d, i) => (
                    <Pressable key={d.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDayIndex(i); }}
                      style={[styles.dayChip, { backgroundColor: i === dayIndex ? `${colors.brand.purple}1F` : colors.background.sunken }]}
                      accessibilityRole="button" accessibilityState={{ selected: i === dayIndex }} accessibilityLabel={dayLabel(d, startDay)}>
                      <Text style={[styles.dayText, { color: i === dayIndex ? colors.brand.purple : colors.text.secondary }]}>{dayLabel(d, startDay)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Text style={[styles.label, { color: colors.text.secondary }]}>Time (optional)</Text>
            <TextInput value={time} onChangeText={setTime} placeholder="9:30 or 7:30 pm" placeholderTextColor={colors.text.tertiary} autoCapitalize="none"
              style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]} accessibilityLabel="Time, optional" />

            <View style={styles.walletRow}>
              <View style={styles.fill}>
                <Text style={[styles.walletTitle, { color: colors.text.primary }]}>Also save to wallet</Text>
                <Text style={[styles.walletBody, { color: colors.text.tertiary }]}>Shows with your trip&apos;s bookings and in your calendar.</Text>
              </View>
              <Switch value={toWallet && walletOk} onValueChange={setToWallet} disabled={!walletOk} accessibilityLabel="Also save to wallet" />
            </View>
            {!walletOk ? (
              <Text style={[styles.walletBody, { color: colors.text.tertiary }]}>
                {!dayForWallet ? 'Add trip dates to save it to your wallet too.' : 'Your free wallet is full. Pro keeps as many bookings as you like.'}
              </Text>
            ) : null}
            {error ? <Text style={[styles.body, { color: colors.semantic.error }]}>{error}</Text> : null}
            <Button label={target?.mode === 'stop' ? 'Mark as booked' : 'Add to trip'} onPress={save} loading={saving} fullWidth />
            <Pressable onPress={onClose} style={styles.link} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={[styles.linkText, { color: colors.text.secondary }]}>Not now</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl },
  content: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], gap: Spacing['2'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  body: { fontSize: FontSize.base, lineHeight: 22 },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginTop: Spacing['3'] },
  input: { minHeight: 48, paddingHorizontal: Spacing['3'], borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth, fontSize: FontSize.base },
  days: { gap: Spacing['2'], paddingVertical: Spacing['1'] },
  dayChip: { minHeight: 36, paddingHorizontal: Spacing['3'], borderRadius: 18, justifyContent: 'center' },
  dayText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], marginVertical: Spacing['3'] },
  walletTitle: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  walletBody: { fontSize: FontSize.sm, marginTop: 2 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
