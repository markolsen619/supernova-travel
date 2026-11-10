/**
 * Profile → Trips → Wish list (spec 2026-11-10 §1): your saved TikTok posts as a photo grid, newest first, filtered by
 * city chips (each post counted once per city it touches); Paste a link on top; an inviting empty state. Private — only
 * ever on your own profile. Covers come from the server in one call (useWishCovers).
 */
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Heart, LinkSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { useWishlist } from '@/hooks/useWishlist';
import { useWishCovers } from '@/hooks/useWishCovers';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChips } from '@/components/explore/FilterChips';
import { WishCard } from '@/components/wishlist/WishCard';
import { savesInCity, tiktokUrlFromShare, wishCityChips, type WishSave } from '@/utils/wishlist';
import { FontSize } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

const ALL = '__all__';

export function WishlistGrid({ header }: { header: ReactElement }) {
  const { colors } = useTheme();
  const { columns } = useLayout();
  const { saves } = useWishlist();
  const [link, setLink] = useState('');
  const [city, setCity] = useState<string>(ALL);

  const newest = useMemo(() => [...saves].sort((a, b) => b.savedAtMs - a.savedAtMs), [saves]);
  const chips = useMemo(() => [{ id: ALL, label: 'All' }, ...wishCityChips(saves).map((c) => ({ id: c.city, label: `${c.city} (${c.count})` }))], [saves]);
  const shown = useMemo(() => savesInCity(newest, city === ALL ? null : city), [newest, city]);
  const covers = useWishCovers(shown.map((s) => s.videoId));

  const paste = useCallback(() => {
    const url = tiktokUrlFromShare(link);
    if (!url) { Alert.alert('Paste a TikTok link', 'Copy the link from TikTok (Share → Copy link), then paste it here.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLink('');
    router.push({ pathname: '/wishlist/save' as never, params: { url } });
  }, [link]);

  const open = useCallback((save: WishSave) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/wishlist/[id]' as never, params: { id: save.videoId } });
  }, []);

  const pasteField = (
    <View style={[styles.paste, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <LinkSimple size={18} color={colors.text.tertiary} />
      <TextInput value={link} onChangeText={setLink} onSubmitEditing={paste} placeholder="Paste a TikTok link" placeholderTextColor={colors.text.tertiary}
        autoCapitalize="none" autoCorrect={false} returnKeyType="go" style={[styles.input, { color: colors.text.primary }]} accessibilityLabel="Paste a TikTok link" />
    </View>
  );

  return (
    <FlashList
      key={`wish-${columns}`}
      data={shown}
      numColumns={columns}
      keyExtractor={(s) => s.videoId}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: Spacing['5'] - 6, paddingBottom: 100 }}
      ListHeaderComponent={
        <View>
          {header}
          {saves.length ? (
            <View style={styles.headPad}>
              {pasteField}
              {chips.length > 2 ? <View style={styles.chips}><FilterChips items={chips} selected={city} onSelect={setCity} label="Filter by city" /></View> : null}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.headPad}>
          <EmptyState icon={Heart} title="Save places from TikTok" description="Share a video to Supernova and its places land here."
            actionLabel="Paste a link" onAction={paste} actionHaptic="light" />
          {pasteField}
        </View>
      }
      renderItem={({ item }) => <WishCard save={item} cover={covers[item.videoId] ?? null} onPress={open} />}
    />
  );
}

const styles = StyleSheet.create({
  headPad: { paddingHorizontal: 6 },
  chips: { marginTop: Spacing['3'], marginBottom: Spacing['2'] },
  paste: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 48, paddingHorizontal: Spacing['3'], borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth, marginTop: Spacing['3'], marginBottom: Spacing['3'] },
  input: { flex: 1, fontSize: FontSize.base, paddingVertical: Spacing['2'] },
});
