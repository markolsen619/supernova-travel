import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { MapPin, Images, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { usePost } from '@/hooks/usePost';
import { useEditPost, PhotoItem } from '@/hooks/useEditPost';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
import { SkeletonBlock, SkeletonListRow } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const MAX_PHOTOS = 10;

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  const { data: post, isLoading } = usePost(id ?? null);
  const isOwner = !!post && !!uid && post.authorUid === uid;
  const { updateCaption, updatePlace, updatePhotos, deletePost, isSaving, uploadProgress } = useEditPost(id ?? '');

  useEffect(() => {
    if (!isLoading && post && !isOwner) {
      router.back();
    }
  }, [isLoading, post, isOwner, router]);

  const [caption, setCaption] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);

  useEffect(() => {
    if (post && !initialized) {
      setCaption(post.caption ?? '');
      setPlaceName(post.placeName ?? '');
      setPhotoItems((post.mediaUrls ?? []).map((url) => ({ kind: 'existing' as const, url })));
      setInitialized(true);
    }
  }, [post, initialized]);

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const pickMorePhotos = useCallback(async () => {
    const remaining = MAX_PHOTOS - photoItems.length;
    if (remaining <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });
    if (result.canceled) return;
    setPhotoItems((prev) => [
      ...prev,
      ...result.assets.map((a) => ({ kind: 'new' as const, localUri: a.uri })),
    ]);
  }, [photoItems.length]);

  const removePhoto = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhotoItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePhotoDragEnd = useCallback(({ data }: { data: PhotoItem[] }) => {
    setPhotoItems(data);
  }, []);

  const renderPhotoItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<PhotoItem>) => {
      const uri = item.kind === 'existing' ? item.url : item.localUri;
      const index = getIndex() ?? 0;
      return (
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          activeOpacity={0.9}
          style={[styles.photoSlot, isActive && styles.photoSlotActive]}
        >
          <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
          <View style={[styles.orderBadge, { backgroundColor: colors.brand.purple }]}>
            <Text style={styles.orderBadgeText}>{index + 1}</Text>
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => removePhoto(index)}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityLabel={`Remove photo ${index + 1}`}
          >
            <X size={12} color="#fff" weight="bold" />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [colors, removePhoto],
  );

  const canSave = post?.mediaType !== 'photo' || photoItems.length > 0;

  const handleSave = useCallback(async () => {
    if (!post || !canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (caption !== (post.caption ?? '')) {
        await updateCaption(caption);
      }
      if (post.mediaType === 'photo') {
        if (placeName !== (post.placeName ?? '')) {
          await updatePlace(placeName.trim() || null);
        }
        await updatePhotos(photoItems);
      }
      router.back();
    } catch (e: unknown) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Check your connection and try again.');
    }
  }, [post, canSave, caption, placeName, photoItems, updateCaption, updatePlace, updatePhotos, router]);

  const handleDelete = useCallback(() => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete this post?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost();
            router.navigate('/(tabs)/profile');
          } catch (e: unknown) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : 'Check your connection and try again.');
          }
        },
      },
    ]);
  }, [post, deletePost, router]);

  if (isLoading || !post) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background.primary, paddingTop: insets.top + Spacing['12'] }]}>
        <SkeletonBlock width="100%" height={100} radius={BorderRadius.lg} />
        <SkeletonListRow />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleCancel} activeOpacity={0.7}>
          <Text style={[styles.headerBack, { color: colors.text.secondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Edit post</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleSave} disabled={isSaving || !canSave} activeOpacity={0.7}>
          <Text style={[styles.headerSave, { color: colors.brand.purple }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          style={[styles.captionInput, { color: colors.text.primary, borderBottomColor: colors.background.cardBorder }]}
          placeholder="Write a caption…"
          placeholderTextColor={colors.text.tertiary}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={500}
        />

        {post.mediaType === 'photo' && (
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
        )}

        {post.mediaType === 'photo' && (
          <View style={styles.photoSection}>
            <Text style={[styles.photoSectionLabel, { color: colors.text.tertiary }]}>
              PHOTOS · DRAG TO REORDER · FIRST IS THE COVER
            </Text>
            <DraggableFlatList
              data={photoItems}
              horizontal
              keyExtractor={(item) => (item.kind === 'existing' ? item.url : item.localUri)}
              renderItem={renderPhotoItem}
              onDragEnd={handlePhotoDragEnd}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
              ListFooterComponent={
                photoItems.length < MAX_PHOTOS ? (
                  <TouchableOpacity
                    style={[styles.addMoreBtn, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder }]}
                    onPress={pickMorePhotos}
                    activeOpacity={0.75}
                  >
                    <Images size={24} color={colors.text.secondary} weight="duotone" />
                    <Text style={[styles.addMoreText, { color: colors.text.secondary }]}>Add more</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
            {isSaving && uploadProgress > 0 && (
              <View style={[styles.progressTrack, { backgroundColor: colors.background.sunken }]}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%`, backgroundColor: colors.brand.purple }]} />
              </View>
            )}
          </View>
        )}

        <View style={styles.deleteButtonWrapper}>
          <Button
            label="Delete post"
            variant="danger"
            size="md"
            fullWidth
            onPress={handleDelete}
            haptic="none"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const THUMB_SIZE = 100;

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, paddingHorizontal: Spacing['5'], gap: Spacing['4'] },
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
  headerSave: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, textAlign: 'right' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing['10'] },
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
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
    gap: Spacing['2'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeInput: { flex: 1, fontSize: FontSize.base },
  photoSection: { marginTop: Spacing['2'] },
  photoSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['3'],
  },
  photoStrip: { paddingHorizontal: Spacing['5'], gap: Spacing['2'] },
  photoSlot: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginRight: Spacing['2'],
  },
  photoSlotActive: { opacity: 0.85 },
  photoThumb: { width: '100%', height: '100%' },
  orderBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: '#fff' },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addMoreText: { fontSize: FontSize.xs },
  progressTrack: {
    height: 4,
    marginHorizontal: Spacing['5'],
    marginTop: Spacing['3'],
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: BorderRadius.full },
  deleteButtonWrapper: { marginHorizontal: Spacing['5'], marginTop: Spacing['6'] },
});
