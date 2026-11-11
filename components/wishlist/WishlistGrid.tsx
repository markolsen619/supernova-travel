/**
 * Profile → Trips → Wish list (spec 2026-11-10 §1): your saved TikTok posts as a photo grid, newest first, filtered by
 * city chips (each post counted once per city it touches); Paste a link on top; an inviting empty state. Private — only
 * ever on your own profile. Covers come from the server in one call (useWishCovers); screenshot saves use their first
 * screenshot. Add screenshots leads (spec 2026-11-11); the link is the secondary "or paste a link".
 */
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ImagesSquare, LinkSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { useWishlist } from '@/hooks/useWishlist';
import { useWishCovers } from '@/hooks/useWishCovers';
import { useShotUrls } from '@/hooks/useShotUrls';
import { pickShots } from '@/services/wishShots';
import { setShotDraft } from '@/services/shotDraft';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChips } from '@/components/explore/FilterChips';
import { WishCard } from '@/components/wishlist/WishCard';
import { savesInCity, tiktokUrlFromShare, wishCityChips, type WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

const ALL = '__all__';

export function WishlistGrid({ header }: { header: ReactElement }) {
  const { colors } = useTheme();
  const { columns } = useLayout();
  const { saves } = useWishlist();
  const [link, setLink] = useState('');
  const [city, setCity] = useState<string>(ALL);
  const [showPaste, setShowPaste] = useState(false);

  const newest = useMemo(() => [...saves].sort((a, b) => b.savedAtMs - a.savedAtMs), [saves]);
  const chips = useMemo(() => [{ id: ALL, label: 'All' }, ...wishCityChips(saves).map((c) => ({ id: c.city, label: `${c.city} (${c.count})` }))], [saves]);
  const shown = useMemo(() => savesInCity(newest, city === ALL ? null : city), [newest, city]);
  // Link saves' covers come from the server; screenshot saves use their first screenshot (spec 2026-11-11).
  const covers = useWishCovers(shown.filter((s) => s.platform !== 'screenshot').map((s) => s.videoId));
  const shotUrls = useShotUrls(shown.filter((s) => s.shots?.length).map((s) => s.shots![0]));

  const paste = useCallback(() => {
    const url = tiktokUrlFromShare(link);
    if (!url) { Alert.alert('Paste a TikTok link', 'Copy the link from TikTok (Share → Copy link), then paste it here.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLink('');
    router.push({ pathname: '/wishlist/save' as never, params: { url } });
  }, [link]);

  const addShots = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const uris = await pickShots();
    if (!uris.length) return;
    setShotDraft(uris);
    router.push({ pathname: '/wishlist/save' as never, params: { mode: 'shots' } });
  }, []);
  const revealPaste = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPaste(true); }, []);

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

  const pasteOrLink = showPaste ? pasteField : (
    <Pressable onPress={revealPaste} style={styles.pasteLink} accessibilityRole="button" accessibilityLabel="Or paste a link">
      <Text style={[styles.pasteLinkText, { color: colors.text.secondary }]}>or paste a link</Text>
    </Pressable>
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
              <Button label="Add screenshots" onPress={addShots} fullWidth />
              {pasteOrLink}
              {chips.length > 2 ? <View style={styles.chips}><FilterChips items={chips} selected={city} onSelect={setCity} label="Filter by city" /></View> : null}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.headPad}>
          <EmptyState icon={ImagesSquare} title="Save places you see online"
            description="Screenshot a TikTok, Reel or post and share it to Supernova. We'll find the places."
            actionLabel="Add screenshots" onAction={addShots} actionHaptic="light" />
          {pasteOrLink}
        </View>
      }
      renderItem={({ item }) => <WishCard save={item} cover={item.shots?.length ? shotUrls[item.shots[0]] ?? null : covers[item.videoId] ?? null} onPress={open} />}
    />
  );
}

const styles = StyleSheet.create({
  headPad: { paddingHorizontal: 6 },
  chips: { marginTop: Spacing['3'], marginBottom: Spacing['2'] },
  paste: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 48, paddingHorizontal: Spacing['3'], borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth, marginTop: Spacing['3'], marginBottom: Spacing['3'] },
  input: { flex: 1, fontSize: FontSize.base, paddingVertical: Spacing['2'] },
  pasteLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pasteLinkText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
