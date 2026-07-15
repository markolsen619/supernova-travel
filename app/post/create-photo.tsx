import { useState, useCallback } from 'react';
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
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Images, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { useCreatePost } from '@/hooks/useCreatePost';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const MAX_PHOTOS = 10;

export default function CreatePhotoScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { createPhotoPost, isUploading, uploadProgress } = useCreatePost();

  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [placeName, setPlaceName] = useState('');

  const pickImages = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.85,
    });
    if (result.canceled) return;
    setSelectedUris(result.assets.map((a) => a.uri));
  }, []);

  const removePhoto = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedUris((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handlePost = useCallback(async () => {
    if (selectedUris.length === 0 || isUploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await createPhotoPost({
        localUris: selectedUris,
        caption,
        placeName: placeName.trim() || null,
      });
      router.navigate('/');
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.');
    }
  }, [selectedUris, isUploading, caption, placeName, createPhotoPost]);

  const canPost = selectedUris.length > 0 && !isUploading;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBack} activeOpacity={0.7}>
          <Text style={[styles.headerBack, { color: colors.text.secondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>New post</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handlePost}
          disabled={!canPost}
          activeOpacity={0.7}
        >
          <Text style={[styles.headerPost, { color: canPost ? colors.brand.purple : colors.text.disabled }]}>Post</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {selectedUris.length === 0 ? (
          /* Empty state — tap to pick. Dashed border is correct here: this
             IS a dropzone, the one hard-rule-sanctioned use. */
          <TouchableOpacity
            style={[styles.emptyPicker, { backgroundColor: colors.background.sunken, borderColor: colors.brand.purple }]}
            onPress={pickImages}
            activeOpacity={0.8}
          >
            <Images size={48} color={colors.brand.purple} weight="duotone" />
            <Text style={[styles.emptyPickerTitle, { color: colors.text.primary }]}>Select photos</Text>
            <Text style={[styles.emptyPickerSub, { color: colors.text.secondary }]}>Choose up to {MAX_PHOTOS} photos</Text>
          </TouchableOpacity>
        ) : (
          /* Photo grid */
          <View style={styles.photoGrid}>
            {selectedUris.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.photoSlot}>
                <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                <View style={[styles.orderBadge, { backgroundColor: colors.brand.purple }]}>
                  <Text style={styles.orderBadgeText}>{index + 1}</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removePhoto(index)}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                  accessibilityLabel={`Remove photo ${index + 1}`}
                >
                  <X size={12} color="#fff" weight="bold" />
                </TouchableOpacity>
              </View>
            ))}

            {selectedUris.length < MAX_PHOTOS && (
              <TouchableOpacity
                style={[styles.addMoreBtn, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder }]}
                onPress={pickImages}
                activeOpacity={0.75}
              >
                <Images size={24} color={colors.text.secondary} weight="duotone" />
                <Text style={[styles.addMoreText, { color: colors.text.secondary }]}>Add more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {selectedUris.length > 0 && (
          <Text style={[styles.photoCount, { color: colors.text.tertiary }]}>
            {selectedUris.length} / {MAX_PHOTOS} photo{selectedUris.length !== 1 ? 's' : ''}
          </Text>
        )}

        {/* Caption */}
        <TextInput
          style={[styles.captionInput, { color: colors.text.primary, borderBottomColor: colors.background.cardBorder }]}
          placeholder="Write a caption…"
          placeholderTextColor={colors.text.tertiary}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={500}
        />

        {/* Place name */}
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

        {/* Upload progress */}
        {isUploading && (
          <View style={[styles.progressTrack, { backgroundColor: colors.background.sunken }]}>
            <View style={[styles.progressFill, { width: `${uploadProgress}%`, backgroundColor: colors.brand.purple }]} />
          </View>
        )}

        {/* Post button — the one hero moment of this flow. */}
        <Button
          label={isUploading ? `Uploading… ${uploadProgress}%` : 'Post'}
          onPress={handlePost}
          disabled={!canPost}
          loading={false}
          variant="hero"
          size="lg"
          fullWidth
          style={styles.postButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const THUMB_SIZE = 100;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 60,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing['2'],
  },
  headerBack: {
    fontSize: FontSize.base,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  headerPost: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    textAlign: 'right',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: Spacing['10'],
  },
  emptyPicker: {
    margin: Spacing['5'],
    height: 200,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    overflow: 'hidden',
  },
  emptyPickerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  emptyPickerSub: {
    fontSize: FontSize.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: Spacing['4'],
    gap: Spacing['2'],
  },
  photoSlot: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
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
  orderBadgeText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: '#fff',
  },
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
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addMoreText: {
    fontSize: FontSize.xs,
  },
  photoCount: {
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing['5'],
    marginBottom: Spacing['2'],
  },
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
  placeInput: {
    flex: 1,
    fontSize: FontSize.base,
  },
  progressTrack: {
    height: 4,
    marginHorizontal: Spacing['5'],
    marginTop: Spacing['4'],
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  postButton: {
    marginHorizontal: Spacing['5'],
    marginTop: Spacing['5'],
  },
});
