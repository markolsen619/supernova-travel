/**
 * Profile → Trips → Wish list (spec 2026-11-06 §2): saved places grouped by city (`TOKYO · 6 PLACES`), each with its
 * type and "from @handle", a check once it's on a trip; Paste a link at the top; an inviting empty state. Private —
 * only ever on your own profile.
 */
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Heart, LinkSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useWishlist } from '@/hooks/useWishlist';
import { EmptyState } from '@/components/ui/EmptyState';
import { WishPlaceRow } from '@/components/wishlist/WishPlaceRow';
import { tiktokUrlFromShare, wishlistByCity, type WishPlace, type WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

type Row = { kind: 'head'; key: string; city: string; count: number } | { kind: 'place'; key: string; save: WishSave; place: WishPlace | null };

export function WishlistList({ header }: { header: ReactElement }) {
  const { colors } = useTheme();
  const { saves } = useWishlist();
  const [link, setLink] = useState('');

  const rows = useMemo<Row[]>(() => wishlistByCity(saves).flatMap((g) => [
    { kind: 'head' as const, key: `h-${g.city}`, city: g.city, count: g.places.filter((p) => p.place).length },
    ...g.places.map((p) => ({ kind: 'place' as const, key: `${p.save.videoId}-${p.place?.id ?? 'none'}`, save: p.save, place: p.place })),
  ]), [saves]);

  const paste = useCallback(() => {
    const url = tiktokUrlFromShare(link);
    if (!url) { Alert.alert('Paste a TikTok link', 'Copy the link from TikTok (Share → Copy link), then paste it here.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLink('');
    router.push({ pathname: '/wishlist/save' as never, params: { url } });
  }, [link]);

  const open = useCallback((save: WishSave, place: WishPlace | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/wishlist/[id]' as never, params: { id: save.videoId, place: place?.id ?? '' } });
  }, []);

  const pasteField = (
    <View style={[styles.paste, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <LinkSimple size={18} color={colors.text.tertiary} />
      <TextInput
        value={link}
        onChangeText={setLink}
        onSubmitEditing={paste}
        placeholder="Paste a TikTok link"
        placeholderTextColor={colors.text.tertiary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        style={[styles.input, { color: colors.text.primary }]}
        accessibilityLabel="Paste a TikTok link"
      />
    </View>
  );

  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.kind}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: Spacing['5'], paddingBottom: 100 }}
      ListHeaderComponent={<View>{header}{saves.length ? pasteField : null}</View>}
      ListEmptyComponent={
        <View>
          <EmptyState
            icon={Heart}
            title="Save places from TikTok"
            description="On TikTok, tap Share, then Supernova. The places in the video land here, ready for your next trip."
            actionLabel="Paste a link instead"
            onAction={paste}
            actionHaptic="light"
          />
          {pasteField}
        </View>
      }
      renderItem={({ item }) => item.kind === 'head' ? (
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>
          {`${item.city.toUpperCase()} · ${item.count} ${item.count === 1 ? 'PLACE' : 'PLACES'}`}
        </Text>
      ) : (
        <WishPlaceRow
          place={item.place ?? { name: 'Name this place', kind: 'other' }}
          meta={`${item.place?.addedTo ? 'On a trip · ' : ''}from @${item.save.authorHandle || item.save.author}`}
          onPress={() => open(item.save, item.place)}
          accessibilityLabel={item.place ? `${item.place.name}, from @${item.save.authorHandle}. Open` : `A saved video with no place named yet. Open`}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginTop: Spacing['5'], marginBottom: Spacing['1'] },
  paste: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 48, paddingHorizontal: Spacing['3'], borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth, marginTop: Spacing['3'] },
  input: { flex: 1, fontSize: FontSize.base, paddingVertical: Spacing['2'] },
});
