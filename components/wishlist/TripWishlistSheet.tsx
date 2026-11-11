/**
 * The trip's Wish list chip (spec 2026-11-06 §2): your saved places within 50 km of this trip's cities, each with Add
 * to a day (an ordinary stop) and a check once it's on the trip. Only ever your own saves, even on a shared trip.
 */
import { useCallback } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { WishPlaceRow } from '@/components/wishlist/WishPlaceRow';
import { fromCreator, type WishPlace, type WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export function TripWishlistSheet({ visible, tripId, matches, onClose, onAdd }: {
  visible: boolean; tripId: string; matches: { save: WishSave; place: WishPlace }[]; onClose: () => void;
  /** Smart add (spec 2026-11-10 §2), run by the trip page once this sheet has closed. */
  onAdd: (m: { save: WishSave; place: WishPlace }) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const add = useCallback((m: { save: WishSave; place: WishPlace }) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose(); onAdd(m); }, [onClose, onAdd]);
  const onTrip = (p: WishPlace) => p.addedTo?.tripId === tripId;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: colors.background.primary, paddingBottom: insets.bottom + Spacing['4'] }]}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{`${matches.length} SAVED ${matches.length === 1 ? 'PLACE' : 'PLACES'} NEARBY`}</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>Your wish list</Text>
        <ScrollView style={styles.list}>
          {matches.map((m) => (
            <WishPlaceRow
              key={`${m.save.videoId}-${m.place.id}`}
              place={m.place}
              meta={onTrip(m.place) ? 'On this trip' : `Add to a day · ${fromCreator(m.save)}`}
              onPress={onTrip(m.place) ? undefined : () => add(m)}
              accessibilityLabel={onTrip(m.place) ? `${m.place.name}, already on this trip` : `Add ${m.place.name} to a day`}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%', paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, gap: Spacing['1'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, marginBottom: Spacing['2'] },
  list: { flexGrow: 0 },
});
