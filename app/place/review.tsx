import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Star, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { useMyReview, usePlaceReviewActions } from '@/hooks/usePlaceReviews';
import { MAX_REVIEW_PHOTOS, MAX_REVIEW_TEXT, reviewProblem } from '@/utils/placeReviews';
import { containsObjectionableText, OBJECTIONABLE_TEXT_MESSAGE } from '@/utils/contentFilter';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

/**
 * Write or edit your review of a place: stars, a few words, up to 6 photos
 * (docs/superpowers/specs/2026-10-09-place-reviews-design.md). "Add photos"
 * opens this with the photo picker straight away.
 */
export default function PlaceReviewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { placeId, placeName, focus } = useLocalSearchParams<{ placeId: string; placeName: string; focus?: string }>();
  const { data: mine, isLoading } = useMyReview(placeId);
  const { save, remove } = usePlaceReviewActions();
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);
  const askedPhotos = useRef(false);

  // Your review as it is, once — not again while you edit.
  useEffect(() => {
    if (seeded.current || isLoading) return;
    seeded.current = true;
    if (mine) {
      setRating(mine.rating);
      setText(mine.text);
      setPhotos(mine.photoUrls);
    }
  }, [mine, isLoading]);

  const pickPhotos = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Before seeding has landed (Add photos on an existing review), count the review's own photos.
    const have = photos.length || (mine?.photoUrls.length ?? 0);
    const room = MAX_REVIEW_PHOTOS - have;
    if (room <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.85,
    });
    if (!result.canceled) setPhotos((cur) => [...cur, ...result.assets.map((a) => a.uri)].slice(0, MAX_REVIEW_PHOTOS));
  }, [photos.length, mine]);

  // "Add photos" from the place sheet: straight to the picker — once, after your review has loaded and the
  // screen has slid in (iOS won't present the picker over a modal still animating). Through a ref, so the
  // photos landing from seeding don't restart (and cancel) the wait.
  const pickRef = useRef(pickPhotos);
  pickRef.current = pickPhotos;
  useEffect(() => {
    if (focus !== 'photos' || isLoading || askedPhotos.current) return;
    const t = setTimeout(() => { askedPhotos.current = true; pickRef.current(); }, 450);
    return () => clearTimeout(t);
  }, [focus, isLoading]);

  const close = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSave = useCallback(async () => {
    const problem = reviewProblem({ rating, text, photoCount: photos.length });
    if (problem) { setError(problem); return; }
    if (containsObjectionableText(text)) { setError(OBJECTIONABLE_TEXT_MESSAGE); return; }
    if (!placeId) return;
    setSaving(true);
    setError(null);
    try {
      await save({
        placeId, placeName: placeName ?? '', rating, text, photos,
        previousPhotos: mine?.photoUrls ?? [], isNew: !mine,
      });
      router.back();
    } catch (err) {
      console.warn('[review] save failed', err);
      setError("Your review didn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [rating, text, photos, placeId, placeName, mine, save]);

  const handleDelete = useCallback(() => {
    if (!mine) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete your review?', 'Its photos are deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(mine);
            router.back();
          } catch {
            setError("Your review wasn't deleted. Check your connection and try again.");
          }
        },
      },
    ]);
  }, [mine, remove]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing['3'] }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{mine ? 'YOUR REVIEW' : 'REVIEW'}</Text>
            <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>{placeName}</Text>
          </View>
          <TouchableOpacity onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <X size={22} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>

        <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Rating, ${rating ?? 0} of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRating(rating === n ? null : n); }}
              style={styles.star}
              accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            >
              <Star size={32} color={rating && n <= rating ? colors.accent.amber : colors.text.disabled} weight={rating && n <= rating ? 'fill' : 'regular'} />
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="What was it like? What should people know?"
          placeholderTextColor={colors.text.tertiary}
          multiline
          maxLength={MAX_REVIEW_TEXT}
          style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
        />

        <View style={styles.photos}>
          {photos.map((uri) => (
            <View key={uri}>
              <Image source={{ uri }} style={[styles.photo, { backgroundColor: colors.background.sunken }]} accessibilityIgnoresInvertColors />
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPhotos((cur) => cur.filter((u) => u !== uri)); }}
                style={[styles.removePhoto, { backgroundColor: colors.background.elevated }]}
                hitSlop={8}
                accessibilityLabel="Remove photo"
              >
                <X size={12} color={colors.text.primary} weight="bold" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < MAX_REVIEW_PHOTOS && (
            <TouchableOpacity onPress={pickPhotos} style={[styles.addPhoto, { backgroundColor: colors.background.sunken }]} accessibilityRole="button" accessibilityLabel="Add photos">
              <Camera size={22} color={colors.text.secondary} weight="duotone" />
              <Text style={[styles.addPhotoText, { color: colors.text.secondary }]}>Add photos</Text>
            </TouchableOpacity>
          )}
        </View>

        {error && <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text>}
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>Anyone on Supernova can see your review, your name and your photos.</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing['4'], borderColor: colors.background.cardBorder }]}>
        <Button label={mine ? 'Save changes' : 'Post review'} onPress={handleSave} loading={saving} haptic="medium" />
        {mine && (
          <TouchableOpacity onPress={handleDelete} style={styles.delete} accessibilityRole="button">
            <Text style={[styles.deleteText, { color: colors.semantic.error }]}>Delete review</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing['5'], paddingBottom: Spacing['6'], gap: Spacing['4'] },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['3'] },
  headerText: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: 26, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  stars: { flexDirection: 'row', gap: Spacing['1'] },
  star: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 140, borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['4'], fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'] },
  photo: { width: 96, height: 96, borderRadius: BorderRadius.md },
  removePhoto: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 96, height: 96, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  addPhotoText: { fontSize: 12, fontWeight: FontWeight.medium },
  error: { fontSize: 14 },
  hint: { fontSize: 13 },
  footer: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['3'], borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing['1'] },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
