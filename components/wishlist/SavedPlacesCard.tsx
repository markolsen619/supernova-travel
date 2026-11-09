/**
 * Saved places when planning (owner, 2026-11-08): "4 saved places in Lisbon" on the AI form and the trip wizard, each
 * ticked, with one action the screen names ("Add to must-sees", or added as stops when the trip is created).
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Heart } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { WishPlaceRow } from '@/components/wishlist/WishPlaceRow';
import type { WishPlace, WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export function SavedPlacesCard({ city, matches, selected, onToggle, actionLabel, onAction, note }: {
  city: string;
  matches: { save: WishSave; place: WishPlace }[];
  /** Ticks shown only when given (the AI form); the wizard just lists them. */
  selected?: Set<string>;
  onToggle?: (placeKey: string) => void;
  actionLabel?: string;
  onAction?: () => void;
  note?: string;
}) {
  const { colors } = useTheme();
  const act = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onAction?.(); }, [onAction]);
  if (!matches.length) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <View style={styles.head}>
        <Heart size={18} weight="duotone" color={colors.brand.pink} />
        <Text style={[styles.title, { color: colors.text.primary }]}>{`${matches.length} saved ${matches.length === 1 ? 'place' : 'places'} in ${city}`}</Text>
      </View>
      {matches.map(({ save, place }) => {
        const key = `${save.videoId}:${place.id}`;
        return (
          <WishPlaceRow key={key} place={place} meta={`from @${save.authorHandle || save.author}`} selected={selected && onToggle ? selected.has(key) : undefined}
            onPress={selected && onToggle ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle(key); } : undefined}
            accessibilityLabel={selected && onToggle ? `${place.name}${selected.has(key) ? ', included' : ', left out'}. Tap to change` : place.name} />
        );
      })}
      {note ? <Text style={[styles.note, { color: colors.text.tertiary }]}>{note}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={act} style={[styles.action, { backgroundColor: `${colors.brand.purple}1F` }]} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={[styles.actionText, { color: colors.brand.purple }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['4'], gap: Spacing['1'], marginTop: Spacing['4'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: Spacing['1'] },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  note: { fontSize: FontSize.sm, marginTop: Spacing['2'] },
  action: { minHeight: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing['3'] },
  actionText: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
