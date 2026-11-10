/**
 * Add a saved place to a trip (spec 2026-11-06 §2): pick an upcoming trip — the ones it's near first — then a day.
 * The stop is an ordinary stop (utils/wishlist `wishActivity`), and the place is marked added on the wish list.
 * `trip` given (the trip chip) skips straight to the day.
 */
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOwnAndJoinedTrips } from '@/hooks/useTripList';
import { useTrip } from '@/hooks/useTrip';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { useWishlist } from '@/hooks/useWishlist';
import { DayPickerSheet } from '@/components/trip/DayPickerSheet';
import { toCalendarDate } from '@/utils/calendarDate';
import { fitsTrip, singleFlight, toTripForMatch, wishActivity, type WishPlace, type WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export function AddWishToTripSheet({ target, tripId: fixedTripId, onClose, onTripChosen }: {
  target: { save: WishSave; place: WishPlace } | null;
  tripId?: string;
  onClose: () => void;
  /** Smart add (spec 2026-11-10 §2): hand the chosen trip back instead of asking for a day here. */
  onTripChosen?: (tripId: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: trips = [] } = useOwnAndJoinedTrips(uid);
  const { addActivity } = useCreateTrip();
  const { markAdded } = useWishlist();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tripId = fixedTripId ?? chosen;
  const { data: trip } = useTrip(target ? tripId : null);

  const today = toCalendarDate(new Date());
  const upcoming = useMemo(() => {
    const list = trips.map((t) => toTripForMatch(t)).filter((t) => !t.end || t.end >= today);
    const near = target ? fitsTrip(target.place, list, today) : null;
    return near ? [near, ...list.filter((t) => t.id !== near.id)] : list;
  }, [trips, today, target]);

  const close = useCallback(() => { setChosen(null); setError(null); onClose(); }, [onClose]);
  const pickTrip = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onTripChosen) { onTripChosen(id); return; }
    setChosen(id);
  }, [onTripChosen]);
  // One add at a time (a double tap added two stops), and a failure says so — the trip list holding `error` is hidden here.
  const pickDayOnce = useMemo(() => singleFlight(async (dayId: string) => {
    if (!target || !tripId) return;
    try {
      const activityId = await addActivity(tripId, dayId, { ...wishActivity(target.place, target.save), createdAt: Timestamp.now() });
      await markAdded(target.save.videoId, target.place.id, { tripId, dayId, activityId });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      close();
    } catch {
      setError("Couldn't add it. Try again.");
      Alert.alert("Couldn't add it", 'Check your connection and try again.');
    }
  }), [target, tripId, addActivity, markAdded, close]);
  const pickDay = useCallback((dayId: string) => { pickDayOnce(dayId); }, [pickDayOnce]);

  const choosingDay = !!target && !!tripId && !!trip;
  return (
    <>
      <Modal visible={!!target && !tripId} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.background.primary, paddingBottom: insets.bottom + Spacing['4'] }]}>
          <Text style={[styles.title, { color: colors.text.primary }]}>{`Add ${target?.place.name ?? ''} to a trip`}</Text>
          {upcoming.length === 0 ? (
            <Text style={[styles.body, { color: colors.text.secondary }]}>No upcoming trips yet. Plan one and your saved places will be waiting.</Text>
          ) : (
            <ScrollView style={styles.list}>
              {upcoming.map((t) => (
                <Pressable key={t.id} onPress={() => pickTrip(t.id)} style={[styles.row, { borderBottomColor: colors.background.cardBorder }]} accessibilityRole="button" accessibilityLabel={`Add to ${t.title}`}>
                  <Text style={[styles.rowTitle, { color: colors.text.primary }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={[styles.rowMeta, { color: colors.text.tertiary }]} numberOfLines={1}>{t.cities.map((c) => c.name).join(' · ')}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {error ? <Text style={[styles.body, { color: colors.semantic.error }]}>{error}</Text> : null}
        </View>
      </Modal>
      <DayPickerSheet visible={choosingDay} days={trip?.days ?? []} onSelect={pickDay} onClose={close} colors={colors} />
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, gap: Spacing['2'] },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold },
  body: { fontSize: FontSize.base, lineHeight: 22 },
  list: { flexGrow: 0 },
  row: { minHeight: 56, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  rowMeta: { fontSize: FontSize.sm, marginTop: 2 },
});
