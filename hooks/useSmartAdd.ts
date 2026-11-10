/**
 * Smart add on a trip (spec 2026-11-10 §2): place a saved place on the best day of its city, then a banner with Change
 * day and Undo. Falls back to the day list when it can't place (no position, no days in that city).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { useWishlist } from '@/hooks/useWishlist';
import { requireOnline } from '@/services/offline';
import { toCalendarDate } from '@/utils/calendarDate';
import { placementInDay, smartAddBanner, smartPlacement } from '@/utils/smartAdd';
import { toTripForMatch, wishActivity, wishByCity, type WishPlace, type WishSave } from '@/utils/wishlist';
import type { TripWithDays } from '@/types';

export type Match = { save: WishSave; place: WishPlace };
export type SmartBannerState = { text: string; activityId: string; dayId: string; match: Match };

const BANNER_MS = 6000;

export function useSmartAdd({ trip, dayCities, destinationNames }: { trip: TripWithDays | null | undefined; dayCities: number[]; destinationNames: string[] }) {
  const { addActivity, deleteActivity } = useCreateTrip();
  const { markAdded, clearAdded } = useWishlist();
  const [banner, setBanner] = useState<SmartBannerState | null>(null);
  const [fallback, setFallback] = useState<Match | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => { if (timer.current) clearTimeout(timer.current); setBanner(null); }, []);
  // Keep the banner (and what Change day needs) while the day list is open: the 6 s timer would clear it under the picker.
  const hold = useCallback(() => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((b: SmartBannerState) => {
    if (timer.current) clearTimeout(timer.current);
    setBanner(b);
    timer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const cityOf = useCallback((m: Match) => {
    if (!trip) return -1;
    const { addedTo: _a, ...place } = m.place;
    const by = wishByCity(toTripForMatch(trip), [{ save: m.save, place }]);
    return by.findIndex((list) => list.length > 0);
  }, [trip]);

  const write = useCallback(async (m: Match, dayId: string, order: number) => {
    const activityId = await addActivity(trip!.id, dayId, { ...wishActivity(m.place, m.save), createdAt: Timestamp.now() }, order);
    await markAdded(m.save.videoId, m.place.id, { tripId: trip!.id, dayId, activityId });
    return activityId;
  }, [trip, addActivity, markAdded]);

  const add = useCallback(async (m: Match): Promise<'added' | 'fallback' | 'offline'> => {
    if (!trip || busy.current) return 'fallback';
    if (!requireOnline()) { Alert.alert('Connect to add this'); return 'offline'; }
    const ci = cityOf(m);
    const spot = ci >= 0 ? smartPlacement(trip, dayCities, ci, { lat: m.place.lat, lng: m.place.lng, title: m.place.name }, toCalendarDate(new Date())) : null;
    if (!spot) { setFallback(m); return 'fallback'; }
    busy.current = true;
    try {
      const activityId = await write(m, spot.dayId, spot.order);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      show({ text: smartAddBanner({ dayNumber: spot.dayNumber, city: destinationNames[ci] ?? '', afterTitle: spot.afterTitle, multiCity: destinationNames.length > 1 }), activityId, dayId: spot.dayId, match: m });
      return 'added';
    } catch {
      Alert.alert("Couldn't add it", 'Check your connection and try again.');
      return 'fallback';
    } finally {
      busy.current = false;
    }
  }, [trip, dayCities, destinationNames, cityOf, write, show]);

  const undo = useCallback(async () => {
    if (!trip || !banner || !requireOnline()) return;
    const b = banner;
    dismiss();
    await deleteActivity(trip.id, b.dayId, b.activityId).catch(() => {});
    await clearAdded(b.match.save.videoId, b.match.place.id);
  }, [trip, banner, dismiss, deleteActivity, clearAdded]);

  const changeDay = useCallback(async (dayId: string) => {
    if (!trip || !banner || !requireOnline() || dayId === banner.dayId) { dismiss(); return; }
    const b = banner;
    const day = trip.days.find((d) => d.id === dayId);
    if (!day) return;
    dismiss();
    await deleteActivity(trip.id, b.dayId, b.activityId).catch(() => {});
    const spot = placementInDay({ ...day, activities: day.activities.filter((a) => a.id !== b.activityId) }, { lat: b.match.place.lat, lng: b.match.place.lng, title: b.match.place.name });
    const activityId = await write(b.match, dayId, spot.order);
    const ci = dayCities[trip.days.findIndex((d) => d.id === dayId)] ?? 0;
    show({ text: smartAddBanner({ dayNumber: day.dayNumber, city: destinationNames[ci] ?? '', afterTitle: spot.afterTitle, multiCity: destinationNames.length > 1 }), activityId, dayId, match: b.match });
  }, [trip, banner, dismiss, deleteActivity, write, dayCities, destinationNames, show]);

  const clearFallback = useCallback(() => setFallback(null), []);
  return { add, banner, changeDay, undo, dismiss, hold, fallback, clearFallback };
}
