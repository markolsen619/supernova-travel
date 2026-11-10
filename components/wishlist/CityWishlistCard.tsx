/**
 * Your saved TikTok places for one city of a trip, shown in that city's part of the itinerary (owner 2026-11-09: the
 * trip's small Wish list chip was missed — "I can't find it in my actual trip"). Each row opens Add to a day. Only
 * ever your own saves (`wishMatches` reads only your wish list), and only places not yet on this trip (`wishByCity`).
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Heart } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { WishPlaceRow } from '@/components/wishlist/WishPlaceRow';
import type { WishPlace, WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

type Match = { save: WishSave; place: WishPlace };
const SHOWN = 4;

export function CityWishlistCard({ matches, onAdd, onSeeAll }: {
  matches: Match[];
  onAdd: (m: Match) => void;
  /** Opens the trip's whole wish list; shown when there are more than fit here. */
  onSeeAll: () => void;
}) {
  const { colors } = useTheme();
  const add = useCallback((m: Match) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(m); }, [onAdd]);
  const seeAll = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSeeAll(); }, [onSeeAll]);
  if (!matches.length) return null;
  const shown = matches.length > SHOWN + 1 ? matches.slice(0, SHOWN) : matches;
  const n = matches.length;

  return (
    <Animated.View entering={FadeIn.springify().damping(11).stiffness(65)} style={[styles.card, { borderColor: colors.background.cardBorder }]}>
      <View style={styles.head}>
        <Heart size={16} weight="duotone" color={colors.brand.pink} />
        <Text style={[styles.title, { color: colors.text.primary }]}>{`${n} saved ${n === 1 ? 'place' : 'places'} from TikTok`}</Text>
      </View>
      {shown.map((m) => (
        <WishPlaceRow
          key={`${m.save.videoId}-${m.place.id}`}
          place={m.place}
          meta={`Add to a day · from @${m.save.authorHandle || m.save.author}`}
          onPress={() => add(m)}
          accessibilityLabel={`Add ${m.place.name} to a day. Saved from @${m.save.authorHandle || m.save.author} on TikTok`}
        />
      ))}
      {shown.length < n ? (
        <Pressable onPress={seeAll} style={styles.more} accessibilityRole="button" accessibilityLabel={`See all ${n} saved places`}>
          <Text style={[styles.moreText, { color: colors.text.secondary }]}>{`See all ${n}`}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing['4'], paddingTop: Spacing['3'], paddingBottom: Spacing['2'], marginBottom: Spacing['4'], gap: Spacing['1'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 28 },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
