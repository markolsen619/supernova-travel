/**
 * "Save to wish list" (spec 2026-11-06-social-wishlist-design.md §1): the post a traveler shared from TikTok, the places
 * the server found in it (ticked, with "Fits your Tokyo trip" when one is near an upcoming trip), Add a place by name,
 * and one primary action, Save. Opened by a share (hooks/useShareIntentRouting) or Paste a link (Profile → Wish list).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { MagnifyingGlass, MapPin, X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAiConsentGate } from '@/components/ai/useAiConsentGate';
import { useLimitPaywall } from '@/hooks/useLimitPaywall';
import { useOwnAndJoinedTrips } from '@/hooks/useTripList';
import { useWishlist } from '@/hooks/useWishlist';
import { Button } from '@/components/ui/Button';
import { KeyboardLift } from '@/components/ui/KeyboardLift';
import { WishPlaceRow } from '@/components/wishlist/WishPlaceRow';
import { readSocialPost } from '@/services/socialPost';
import { searchPlaceInBounds } from '@/services/places/mapboxSearch';
import { toCalendarDate } from '@/utils/calendarDate';
import { afterLimitPaywall, fitsTrip, toTripForMatch, wishlistDoc, type WishPlace, type WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

type Preview = WishSave & { coverUrl: string | null };

/** Close, top right, in every state (device test 2026-11-08: there was no way out). */
function CloseButton({ color, background }: { color: string; background: string }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
      style={[closeStyles.btn, { backgroundColor: background }]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Close"
    >
      <X size={18} weight="bold" color={color} />
    </Pressable>
  );
}
const closeStyles = StyleSheet.create({
  btn: { position: 'absolute', top: Spacing['4'], right: Spacing['4'], width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
});

function errorCopy(code: string, reason: unknown): string {
  if (code.endsWith('not-found')) return "That video isn't available. It may be private or deleted.";
  if (code.endsWith('invalid-argument')) return 'Supernova can save TikTok posts for now.';
  if (code.endsWith('resource-exhausted') && reason === 'hourly') return "That's a lot of saving. Try again in a few minutes.";
  if (code.endsWith('unavailable') || code.endsWith('deadline-exceeded')) return 'Connect to save this post, then try again.';
  return "Couldn't read this post. Try again.";
}

export default function SaveFromSocialScreen() {
  const { url } = useLocalSearchParams<{ url?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { requireConsent, consentSheet } = useAiConsentGate();
  const { data: trips = [] } = useOwnAndJoinedTrips(uid);
  const { save } = useWishlist();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<WishPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  const started = useRef(false);
  const consentAsked = useRef(false);

  const today = toCalendarDate(new Date());
  const tripsForMatch = useMemo(() => trips.map((t) => toTripForMatch(t)), [trips]);

  const run = useCallback(async () => {
    if (!url) { setError('Supernova can save TikTok posts for now.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const p = await readSocialPost(url);
      setPreview(p);
      setKept(new Set(p.places.map((x) => x.id)));
    } catch (e) {
      const err = e as { code?: string; details?: { reason?: unknown } };
      if (err.code?.endsWith('resource-exhausted') && err.details?.reason === 'monthly') { openPaywall(); return; }
      // Ask once: with a stale local consent the gate runs `run` at once and this looped (final review).
      if (err.code?.endsWith('failed-precondition')) {
        if (!consentAsked.current) { consentAsked.current = true; requireConsent('agent', run, () => router.back()); return; }
        setError('Allow AI data sharing in Settings → Privacy to save TikTok posts.');
        return;
      }
      setError(errorCopy(err.code ?? '', err.details?.reason));
    } finally {
      setLoading(false);
    }
    // openPaywall is stable for the screen's life; declared below to share `run` as its return.
  }, [url, requireConsent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry only once the account is paid; a cancel shows why it stopped (it reopened the paywall forever before).
  const onPaywallClosed = useCallback(() => {
    const { serverTier, tier } = useAuthStore.getState();
    if (afterLimitPaywall(serverTier ?? tier) === 'retry') { run(); return; }
    setError('Free accounts save 20 videos a month. Pro saves as many as you like.');
    setLoading(false);
  }, [run]);
  const openPaywall = useLimitPaywall(onPaywallClosed);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    requireConsent('agent', run, () => router.back());
  }, [requireConsent, run]);

  const toggle = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setKept((k) => { const n = new Set(k); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const addByName = useCallback(async () => {
    const name = query.trim();
    if (!name || !preview) return;
    setAdding(true); setNotFound(false);
    const c = preview.cityLat != null && preview.cityLng != null ? { lat: preview.cityLat, lng: preview.cityLng } : null;
    const d = 0.3; // the post's city, ~30 km
    const found = await searchPlaceInBounds(c ? name : `${name}${preview.city ? `, ${preview.city}` : ''}`, c ? [c.lng - d, c.lat - d, c.lng + d, c.lat + d] : null, c);
    setAdding(false);
    if (!found) { setNotFound(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Typed with every field set (Firestore refuses undefined values).
    setExtra((x) => [...x, { id: `x${Date.now()}`, name: found.name, kind: 'other', city: preview.city, countryCode: found.countryCode ?? null, lat: found.lat, lng: found.lng }]);
    setQuery('');
  }, [query, preview]);

  const removeExtra = useCallback((id: string) => setExtra((x) => x.filter((p) => p.id !== id)), []);

  const onSave = useCallback(async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await save(wishlistDoc(preview, [...kept], extra));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      if ((e as Error).message !== 'offline') setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [preview, kept, extra, save]);

  const fitLabel = useCallback((p: Pick<WishPlace, 'lat' | 'lng' | 'city'>) => {
    const t = fitsTrip(p, tripsForMatch, today);
    return t ? `Fits your ${t.title} trip` : p.city;
  }, [tripsForMatch, today]);

  if (loading || (!preview && !error)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
        <ActivityIndicator color={colors.text.secondary} />
        <Text style={[styles.body, { color: colors.text.secondary }]}>Reading the post</Text>
        <CloseButton color={colors.text.primary} background={colors.background.sunken} />
        {consentSheet}
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
        <MapPin size={36} weight="duotone" color={colors.text.disabled} />
        <Text style={[styles.title, { color: colors.text.primary }]}>{"Couldn't save this one"}</Text>
        <Text style={[styles.body, { color: colors.text.secondary }]}>{error}</Text>
        <Button label="Try again" onPress={run} />
        <Pressable onPress={() => router.back()} style={styles.link} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={[styles.linkText, { color: colors.text.secondary }]}>Close</Text>
        </Pressable>
        <CloseButton color={colors.text.primary} background={colors.background.sunken} />
        {consentSheet}
      </View>
    );
  }

  const count = kept.size + extra.length;
  return (
    <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
      <KeyboardLift>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.postRow}>
            {preview.coverUrl
              ? <Image source={{ uri: preview.coverUrl }} style={[styles.cover, { backgroundColor: colors.background.sunken }]} contentFit="cover" accessibilityLabel="The post's cover" />
              : <View style={[styles.cover, { backgroundColor: colors.background.sunken }]} />}
            <View style={styles.postText}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{`TIKTOK · @${preview.authorHandle || preview.author}`.toUpperCase()}</Text>
              <Text style={[styles.caption, { color: colors.text.secondary }]} numberOfLines={4}>{preview.caption || 'No caption'}</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text.primary }]}>Save to wish list</Text>
          {preview.places.length === 0 ? (
            <Text style={[styles.body, { color: colors.text.secondary }]}>
              {'No places named in this post. Add the place by name and it\'s saved with the video.'}
            </Text>
          ) : null}

          {preview.places.map((p) => (
            <WishPlaceRow key={p.id} place={p} meta={fitLabel(p)} selected={kept.has(p.id)} onPress={() => toggle(p.id)}
              accessibilityLabel={`${p.name}${kept.has(p.id) ? ', will be saved' : ', left out'}. Tap to ${kept.has(p.id) ? 'leave out' : 'keep'}`} />
          ))}
          {extra.map((p) => (
            <View key={p.id} style={styles.extraRow}>
              <View style={styles.fill}><WishPlaceRow place={p} meta={fitLabel(p)} /></View>
              <Pressable onPress={() => removeExtra(p.id)} hitSlop={10} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`}>
                <X size={16} weight="bold" color={colors.text.tertiary} />
              </Pressable>
            </View>
          ))}

          <Text style={[styles.label, { color: colors.text.secondary }]}>Add a place by name</Text>
          <View style={[styles.search, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
            <MagnifyingGlass size={18} color={colors.text.tertiary} />
            <TextInput
              value={query}
              onChangeText={(t) => { setQuery(t); setNotFound(false); }}
              onSubmitEditing={addByName}
              placeholder={preview.city ? `A place in ${preview.city}` : 'A place and its city'}
              placeholderTextColor={colors.text.tertiary}
              returnKeyType="search"
              style={[styles.input, { color: colors.text.primary }]}
              accessibilityLabel="Add a place by name"
            />
            {adding ? <ActivityIndicator color={colors.text.secondary} /> : null}
          </View>
          {notFound ? <Text style={[styles.note, { color: colors.text.tertiary }]}>{`Couldn't find that${preview.city ? ` near ${preview.city}` : ''}. Try the full name.`}</Text> : null}
          {error ? <Text style={[styles.note, { color: colors.semantic.error }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardLift>
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing['3'], backgroundColor: colors.background.primary, borderTopColor: colors.background.cardBorder }]}>
        <Button label={count ? `Save ${count} ${count === 1 ? 'place' : 'places'}` : 'Save the video'} onPress={onSave} loading={saving} fullWidth />
      </View>
      <CloseButton color={colors.text.primary} background={colors.background.sunken} />
      {consentSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing['3'], paddingHorizontal: Spacing['6'] },
  content: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['6'], gap: Spacing['2'] },
  postRow: { flexDirection: 'row', gap: Spacing['3'], marginBottom: Spacing['4'], paddingRight: 44 },
  cover: { width: 84, height: 120, borderRadius: BorderRadius.md },
  postText: { flex: 1, gap: Spacing['1'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  caption: { fontSize: FontSize.sm, lineHeight: 19 },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  body: { fontSize: FontSize.base, lineHeight: 22, textAlign: 'left' },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginTop: Spacing['5'] },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 48, paddingHorizontal: Spacing['3'], borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: FontSize.base, paddingVertical: Spacing['2'] },
  note: { fontSize: FontSize.sm },
  extraRow: { flexDirection: 'row', alignItems: 'center' },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing['5'], paddingTop: Spacing['3'], borderTopWidth: StyleSheet.hairlineWidth },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
