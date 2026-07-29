import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { usePost } from '@/hooks/usePost';
import { useEditPost } from '@/hooks/useEditPost';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
import { SkeletonBlock, SkeletonListRow } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  const { data: post, isLoading } = usePost(id ?? null);
  const isOwner = !!post && !!uid && post.authorUid === uid;
  const { updateCaption, updatePlace, deletePost, isSaving } = useEditPost(id ?? '');

  useEffect(() => {
    if (!isLoading && post && !isOwner) {
      router.back();
    }
  }, [isLoading, post, isOwner, router]);

  const [caption, setCaption] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (post && !initialized) {
      setCaption(post.caption ?? '');
      setPlaceName(post.placeName ?? '');
      setInitialized(true);
    }
  }, [post, initialized]);

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const handleSave = useCallback(async () => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (caption !== (post.caption ?? '')) {
        await updateCaption(caption);
      }
      if (post.mediaType === 'photo' && placeName !== (post.placeName ?? '')) {
        await updatePlace(placeName.trim() || null);
      }
      router.back();
    } catch (e: unknown) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Check your connection and try again.');
    }
  }, [post, caption, placeName, updateCaption, updatePlace, router]);

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
        <TouchableOpacity style={styles.headerBtn} onPress={handleSave} disabled={isSaving} activeOpacity={0.7}>
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

        <Button
          label="Delete post"
          variant="danger"
          size="md"
          fullWidth
          onPress={handleDelete}
          haptic="none"
          style={styles.deleteButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
  deleteButton: { marginHorizontal: Spacing['5'], marginTop: Spacing['6'] },
});
