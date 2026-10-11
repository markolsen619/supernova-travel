import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { useCreatePost } from '@/hooks/useCreatePost';
import { MAX_VIDEO_SECONDS } from '@/utils/videoPost';
import { CLIP_AUDIO_MIXING } from '@/utils/videoPlayback';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface Clip {
  uri: string;
  durationMs: number | null;
}

/** The chosen clip on a muted loop. Keyed by its uri, so another clip gets a fresh player. */
function ClipPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = CLIP_AUDIO_MIXING;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

/**
 * Post a video (docs/superpowers/specs/2026-10-10-video-posts-design.md): iOS's picker trims to
 * 30 s, then caption and place; createVideoPost compresses, takes a cover and uploads.
 */
export default function CreateVideoScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { createVideoPost, isUploading, uploadProgress } = useCreatePost();

  const [clip, setClip] = useState<Clip | null>(null);
  const [caption, setCaption] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  const pickClip = useCallback(async (closeIfNone: boolean) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      videoMaxDuration: MAX_VIDEO_SECONDS,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) {
      if (closeIfNone) router.back();
      return;
    }
    const a = result.assets[0];
    setError(null);
    setClip({ uri: a.uri, durationMs: a.duration ?? null });
  }, []);

  // Straight to the picker on open — the screen is about the clip.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const t = setTimeout(() => pickClip(true), 350); // after the modal has slid in
    return () => clearTimeout(t);
  }, [pickClip]);

  const handleChooseAnother = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pickClip(false);
  }, [pickClip]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handlePost = useCallback(async () => {
    if (!clip || isUploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    try {
      await createVideoPost({
        localUri: clip.uri,
        pickerDurationMs: clip.durationMs,
        caption,
        placeName: placeName.trim() || null,
      });
      // Two modals deep (add-to-feed → here): unwind both, then the feed (Architecture Rule 15).
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Your video didn't upload. Check your connection and try again.");
    }
  }, [clip, isUploading, caption, placeName, createVideoPost]);

  const canPost = !!clip && !isUploading;

  return (
    <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBack} activeOpacity={0.7} accessibilityRole="button">
          <Text style={[styles.headerBack, { color: colors.text.secondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>New video</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.preview, { backgroundColor: colors.background.sunken }]}>
          {clip ? <ClipPreview key={clip.uri} uri={clip.uri} /> : null}
        </View>
        <TouchableOpacity onPress={handleChooseAnother} style={styles.another} accessibilityRole="button" disabled={isUploading}>
          <Text style={[styles.anotherText, { color: colors.text.secondary }]}>{clip ? 'Choose another clip' : 'Choose a clip'}</Text>
        </TouchableOpacity>

        <TextInput
          style={[styles.captionInput, { color: colors.text.primary, borderBottomColor: colors.background.cardBorder }]}
          placeholder="Write a caption…"
          placeholderTextColor={colors.text.tertiary}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={500}
        />

        <View style={[styles.placeRow, { borderBottomColor: colors.background.cardBorder }]}>
          <MapPin size={18} color={colors.text.secondary} weight="duotone" />
          <TextInput
            style={[styles.placeInput, { color: colors.text.primary }]}
            placeholder="Add a place…"
            placeholderTextColor={colors.text.tertiary}
            value={placeName}
            onChangeText={setPlaceName}
            returnKeyType="done"
          />
        </View>

        {isUploading && (
          <View style={[styles.progressTrack, { backgroundColor: colors.background.sunken }]}>
            <View style={[styles.progressFill, { width: `${uploadProgress}%`, backgroundColor: colors.brand.purple }]} />
          </View>
        )}
        {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}

        <View style={styles.postButtonWrapper}>
          <Button
            label={isUploading ? `Uploading… ${uploadProgress}%` : 'Post'}
            onPress={handlePost}
            disabled={!canPost}
            loading={false}
            variant="hero"
            size="lg"
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { minWidth: 60, minHeight: 44, justifyContent: 'center', paddingVertical: Spacing['2'] },
  headerBack: { fontSize: FontSize.base },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing['10'] },
  preview: {
    marginHorizontal: Spacing['5'],
    marginTop: Spacing['5'],
    aspectRatio: 9 / 16,
    maxHeight: 420,
    alignSelf: 'center',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  another: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing['4'] },
  anotherText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  captionInput: {
    fontSize: FontSize.base,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['3'],
    minHeight: 80,
    textAlignVertical: 'top',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeInput: { flex: 1, fontSize: FontSize.base },
  progressTrack: { height: 4, marginHorizontal: Spacing['5'], marginTop: Spacing['4'], borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%' },
  error: { fontSize: FontSize.sm, marginHorizontal: Spacing['5'], marginTop: Spacing['3'] },
  postButtonWrapper: { paddingHorizontal: Spacing['5'], marginTop: Spacing['6'] },
});
