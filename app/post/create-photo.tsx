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
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Images, X } from 'phosphor-react-native';
import { useCreatePost } from '@/hooks/useCreatePost';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const MAX_PHOTOS = 10;

export default function CreatePhotoScreen() {
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
    setSelectedUris((prev) => prev.filter((_, i) => i !== index));
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
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#020208', '#07031a'] as [string, string]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.headerBack}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handlePost}
          disabled={!canPost}
          activeOpacity={0.7}
        >
          <Text style={[styles.headerPost, !canPost && styles.headerPostDisabled]}>Post</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {selectedUris.length === 0 ? (
          /* Empty state — tap to pick */
          <TouchableOpacity style={styles.emptyPicker} onPress={pickImages} activeOpacity={0.8}>
            <LinearGradient
              colors={['rgba(167,139,250,0.12)', 'rgba(244,114,182,0.08)'] as [string, string]}
              style={StyleSheet.absoluteFill}
            />
            <Images size={48} color="#a78bfa" weight="duotone" />
            <Text style={styles.emptyPickerTitle}>Select Photos</Text>
            <Text style={styles.emptyPickerSub}>Choose up to {MAX_PHOTOS} photos</Text>
          </TouchableOpacity>
        ) : (
          /* Photo grid */
          <View style={styles.photoGrid}>
            {selectedUris.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.photoSlot}>
                <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{index + 1}</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removePhoto(index)}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                >
                  <X size={12} color="#fff" weight="bold" />
                </TouchableOpacity>
              </View>
            ))}

            {selectedUris.length < MAX_PHOTOS && (
              <TouchableOpacity style={styles.addMoreBtn} onPress={pickImages} activeOpacity={0.75}>
                <Images size={24} color={DarkColors.text.secondary} weight="duotone" />
                <Text style={styles.addMoreText}>Add more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {selectedUris.length > 0 && (
          <Text style={styles.photoCount}>
            {selectedUris.length} / {MAX_PHOTOS} photo{selectedUris.length !== 1 ? 's' : ''}
          </Text>
        )}

        {/* Caption */}
        <TextInput
          style={styles.captionInput}
          placeholder="Write a caption…"
          placeholderTextColor={DarkColors.text.tertiary}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={500}
        />

        {/* Place name */}
        <View style={styles.placeRow}>
          <MapPin size={18} color={DarkColors.text.secondary} weight="duotone" />
          <TextInput
            style={styles.placeInput}
            placeholder="Add a place…"
            placeholderTextColor={DarkColors.text.tertiary}
            value={placeName}
            onChangeText={setPlaceName}
            returnKeyType="done"
          />
        </View>

        {/* Upload progress */}
        {isUploading && (
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#a78bfa', '#f472b6'] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${uploadProgress}%` }]}
            />
          </View>
        )}

        {/* Post button */}
        <TouchableOpacity
          style={[styles.postButton, !canPost && styles.postButtonDisabled]}
          onPress={handlePost}
          disabled={!canPost}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={canPost ? (['#a78bfa', '#f472b6'] as [string, string]) : (['#2a2a3a', '#2a2a3a'] as [string, string])}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.postButtonGradient}
          >
            <Text style={styles.postButtonText}>
              {isUploading ? `Uploading… ${uploadProgress}%` : 'Post'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const THUMB_SIZE = 100;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020208',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerBtn: {
    minWidth: 60,
    paddingVertical: Spacing['2'],
  },
  headerBack: {
    fontSize: FontSize.base,
    color: DarkColors.text.secondary,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.primary,
  },
  headerPost: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: '#a78bfa',
    textAlign: 'right',
  },
  headerPostDisabled: {
    color: DarkColors.text.tertiary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: Spacing['10'],
  },
  emptyPicker: {
    margin: Spacing['5'],
    height: 200,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    overflow: 'hidden',
  },
  emptyPickerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.primary,
  },
  emptyPickerSub: {
    fontSize: FontSize.sm,
    color: DarkColors.text.secondary,
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
    backgroundColor: '#a78bfa',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  addMoreText: {
    fontSize: FontSize.xs,
    color: DarkColors.text.secondary,
  },
  photoCount: {
    fontSize: FontSize.xs,
    color: DarkColors.text.tertiary,
    paddingHorizontal: Spacing['5'],
    marginBottom: Spacing['2'],
  },
  captionInput: {
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['3'],
    minHeight: 80,
    textAlignVertical: 'top',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
    gap: Spacing['2'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  placeInput: {
    flex: 1,
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  postButtonDisabled: { opacity: 0.5 },
  postButtonGradient: {
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  postButtonText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#fff',
  },
});
