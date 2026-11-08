/** A place on the wish list: type icon, name, city or "Fits your Tokyo trip", and a tick or check (spec 2026-11-06). */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { wishKindIcon } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { WishPlace } from '@/utils/wishlist';

export const WishPlaceRow = memo(function WishPlaceRow({ place, meta, selected, onPress, accessibilityLabel }: {
  place: Pick<WishPlace, 'name' | 'kind'>;
  meta: string | null;
  /** true/false shows a tick toggle; undefined shows none. */
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const { Icon, color } = wishKindIcon(place.kind);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? place.name}
    >
      <TypeIconBubble Icon={Icon} color={color} />
      <View style={styles.text}>
        <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{place.name}</Text>
        {meta ? <Text style={[styles.meta, { color: colors.text.tertiary }]} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {selected === undefined ? null : selected
        ? <CheckCircle size={22} weight="fill" color={colors.brand.purple} />
        : <View style={[styles.ring, { borderColor: colors.text.tertiary }]} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 56, paddingVertical: Spacing['2'], borderBottomWidth: StyleSheet.hairlineWidth },
  text: { flex: 1 },
  name: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  meta: { fontSize: FontSize.sm, marginTop: 2 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, margin: 1 },
});
