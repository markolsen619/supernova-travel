/**
 * One saved post in the profile's wish list grid (spec 2026-11-10 §1): the cover (from the server; a quiet mark while
 * it loads or if there's none), the city eyebrow, the creator, and "On a trip" once any of its places is on one.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ImageSquare } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { creatorLabel, wishCardEyebrow, type WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const WishCard = memo(function WishCard({ save, cover, onPress }: { save: WishSave; cover: string | null; onPress: (save: WishSave) => void }) {
  const { colors } = useTheme();
  const onTrip = save.places.some((p) => p.addedTo);
  const creator = creatorLabel(save);
  return (
    <Pressable onPress={() => onPress(save)} style={styles.card} accessibilityRole="button"
      accessibilityLabel={`${wishCardEyebrow(save).toLowerCase()}, by ${creator}${onTrip ? ', on a trip' : ''}. Open`}>
      <View style={[styles.cover, { backgroundColor: colors.background.sunken }]}>
        {cover
          ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" recyclingKey={save.videoId} />
          : <ImageSquare size={26} weight="duotone" color={colors.text.disabled} />}
        {onTrip ? (
          <View style={[styles.tag, { backgroundColor: colors.background.primary }]}>
            <Text style={[styles.tagText, { color: colors.text.primary }]}>On a trip</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.eyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>{wishCardEyebrow(save)}</Text>
      <Text style={[styles.handle, { color: colors.text.primary }]} numberOfLines={1}>{creator}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, marginHorizontal: 6, marginBottom: Spacing['5'] },
  cover: { width: '100%', aspectRatio: 4 / 5, borderRadius: BorderRadius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', left: Spacing['2'], bottom: Spacing['2'], paddingHorizontal: Spacing['2'], paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginTop: Spacing['2'] },
  handle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginTop: 2 },
});
