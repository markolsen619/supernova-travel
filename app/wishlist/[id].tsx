/**
 * A saved post (spec 2026-11-06 §2): its cover (fresh from TikTok, never stored), creator and caption, its places with
 * Add to a trip, Watch on TikTok (screenshot saves: their screenshots instead — spec 2026-11-11), and delete. `id` = the TikTok video id; `place` = the place tapped, listed first.
 */
import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { CaretLeft, Heart, ImageSquare, Trash, X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useWishlist } from '@/hooks/useWishlist';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { WishPlaceRow } from '@/components/wishlist/WishPlaceRow';
import { AddWishToTripSheet } from '@/components/wishlist/AddWishToTripSheet';
import { useWishCovers } from '@/hooks/useWishCovers';
import { useShotUrls } from '@/hooks/useShotUrls';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOwnAndJoinedTrips } from '@/hooks/useTripList';
import { toCalendarDate } from '@/utils/calendarDate';
import { tiktokEyebrow, toTripForMatch, tripsFitting, type WishPlace } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export default function SavedPostScreen() {
  const { id, place: placeId } = useLocalSearchParams<{ id: string; place?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { saves, isLoading, remove, removePlace } = useWishlist();
  const save = saves.find((s) => s.videoId === id) ?? null;
  const cover = useWishCovers(save && save.platform !== 'screenshot' ? [save.videoId] : [])[save?.videoId ?? ''] ?? null;
  // Screenshot saves (spec 2026-11-11): their screenshots, paged, and full screen on a tap.
  const shotUrls = useShotUrls(save?.shots ?? []);
  const { width } = useWindowDimensions();
  const [fullShot, setFullShot] = useState<string | null>(null);
  const closeFull = useCallback(() => setFullShot(null), []);
  const [adding, setAdding] = useState<WishPlace | null>(null);


  const places = useMemo(() => {
    const list = save?.places ?? [];
    return [...list.filter((p) => p.id === placeId), ...list.filter((p) => p.id !== placeId)];
  }, [save, placeId]);

  const watch = useCallback(() => {
    if (!save) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(save.postUrl).catch(() => {});
  }, [save]);

  // Smart add (spec 2026-11-10 §2): one fitting trip → open it and let the trip page place the stop; else pick the trip.
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: trips = [] } = useOwnAndJoinedTrips(uid);
  const openSmartAdd = useCallback((p: WishPlace, tripId: string) => {
    if (!save) return;
    setAdding(null);
    router.push({ pathname: '/trip/[id]' as never, params: { id: tripId, wishVideo: save.videoId, wishPlace: p.id } });
  }, [save]);
  const addToTrip = useCallback((p: WishPlace) => {
    const fitting = tripsFitting(p, trips.map((t) => toTripForMatch(t)), toCalendarDate(new Date()));
    if (fitting.length === 1) openSmartAdd(p, fitting[0].id);
    else setAdding(p);
  }, [trips, openSmartAdd]);
  const chooseTrip = useCallback((tripId: string) => { if (adding) openSmartAdd(adding, tripId); }, [adding, openSmartAdd]);

  const placeActions = useCallback((p: WishPlace) => {
    if (!save) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(p.name, p.addedTo ? "It's on one of your trips." : undefined, [
      { text: 'Add to a trip', onPress: () => addToTrip(p) },
      { text: 'Remove from wish list', style: 'destructive', onPress: () => removePlace(save.videoId, p.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [save, removePlace, addToTrip]);

  const goBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile');
  }, []);

  const deleteSave = useCallback(() => {
    if (!save) return;
    Alert.alert('Delete this save?', 'Its places leave your wish list. Stops already on a trip stay there.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); await remove(save.videoId); router.back(); } },
    ]);
  }, [save, remove]);

  if (!save) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background.primary, paddingTop: insets.top + Spacing['8'] }]}>
        {isLoading ? null : (
          <EmptyState icon={Heart} title="This save is gone" description="It may have been deleted on another phone." actionLabel="Back to your wish list" onAction={() => router.back()} actionHaptic="light" />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing['8'] }}>
        {save.platform === 'screenshot' ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {(save.shots ?? []).map((path, i, all) => (
              <Pressable key={path} onPress={() => shotUrls[path] && setFullShot(shotUrls[path])} accessibilityRole="imagebutton"
                accessibilityLabel={`Screenshot ${i + 1} of ${all.length}. Open full screen`}>
                {shotUrls[path]
                  ? <Image source={{ uri: shotUrls[path] }} style={[styles.cover, { width, backgroundColor: colors.background.sunken }]} contentFit="cover" />
                  : <View style={[styles.cover, styles.coverEmpty, { width, backgroundColor: colors.background.sunken }]}><ImageSquare size={32} weight="duotone" color={colors.text.disabled} /></View>}
              </Pressable>
            ))}
          </ScrollView>
        ) : cover
          ? <Image source={{ uri: cover }} style={[styles.cover, { backgroundColor: colors.background.sunken }]} contentFit="cover" accessibilityLabel="The post's cover" />
          : (
            <View style={[styles.cover, styles.coverEmpty, { backgroundColor: colors.background.sunken }]}>
              <ImageSquare size={32} weight="duotone" color={colors.text.disabled} />
            </View>
          )}
        <View style={styles.body}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{tiktokEyebrow(save)}</Text>
          {save.caption ? <Text style={[styles.caption, { color: colors.text.secondary }]}>{save.caption}</Text> : null}
          {save.platform === 'screenshot' ? null : <Button label="Watch on TikTok" onPress={watch} fullWidth />}

          <Text style={[styles.section, { color: colors.text.primary }]}>{places.length ? (save.platform === 'screenshot' ? 'Places in these screenshots' : 'Places in this video') : 'No place named yet'}</Text>
          {places.map((p) => (
            <WishPlaceRow key={p.id} place={p} meta={p.addedTo ? 'On a trip' : p.city} onPress={() => placeActions(p)}
              accessibilityLabel={`${p.name}${p.addedTo ? ', on a trip' : ''}. Add to a trip or remove`} />
          ))}

          <Pressable onPress={deleteSave} style={styles.delete} accessibilityRole="button" accessibilityLabel="Delete this save">
            <Trash size={16} color={colors.semantic.error} />
            <Text style={[styles.deleteText, { color: colors.semantic.error }]}>Delete this save</Text>
          </Pressable>
        </View>
      </ScrollView>
      {/* Back, over the cover (device test 2026-11-09: the screen had no way out but an edge swipe). Dark glass so it
          reads on any photo and on the empty cover in both themes. */}
      <Pressable onPress={goBack} style={[styles.back, { top: insets.top + Spacing['2'] }]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Back">
        <CaretLeft size={20} weight="bold" color="#FFFFFF" />
      </Pressable>
      <AddWishToTripSheet target={adding ? { save, place: adding } : null} onTripChosen={chooseTrip} onClose={() => setAdding(null)} />
      <Modal visible={!!fullShot} transparent animationType="fade" onRequestClose={closeFull}>
        <View style={styles.full}>
          {fullShot ? <Image source={{ uri: fullShot }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Screenshot" /> : null}
          <Pressable onPress={closeFull} style={[styles.back, { top: insets.top + Spacing['2'], left: undefined, right: Spacing['4'] }]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} weight="bold" color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { width: '100%', aspectRatio: 4 / 5, borderBottomLeftRadius: BorderRadius.xl, borderBottomRightRadius: BorderRadius.xl },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  full: { flex: 1, backgroundColor: '#000000' },
  back: { position: 'absolute', left: Spacing['4'], width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,10,18,0.55)' },
  body: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], gap: Spacing['3'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  caption: { fontSize: FontSize.base, lineHeight: 22 },
  section: { fontSize: FontSize.md, fontWeight: FontWeight.medium, marginTop: Spacing['4'] },
  delete: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44, marginTop: Spacing['5'] },
  deleteText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
