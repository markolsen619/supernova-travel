import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
  doc,
  getDoc,
} from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonBlock, SkeletonListRow } from '@/components/ui/Skeleton';
import { Comment, Post } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { MapTrifold, ArrowLeft, MapPin, ArrowRight, PencilSimple } from 'phosphor-react-native';
import { Button } from '@/components/ui/Button';
import * as Haptics from 'expo-haptics';
import { useUserProfile } from '@/hooks/useUserProfile';

function formatTimestamp(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function CommentRow({ comment }: { comment: Comment }) {
  const { colors } = useTheme();
  return (
    <View style={styles.commentRow}>
      <Avatar uri={comment.authorAvatarUrl} name={comment.authorDisplayName} size="xs" />
      <View style={styles.commentContent}>
        <Text style={[styles.commentAuthor, { color: colors.text.primary }]}>
          {comment.authorDisplayName}
        </Text>
        <Text style={[styles.commentText, { color: colors.text.secondary }]}>
          {comment.text}
        </Text>
      </View>
      <Text style={[styles.commentTime, { color: colors.text.tertiary }]}>
        {formatTimestamp(comment.createdAt as unknown as { toDate?: () => Date })}
      </Text>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  const [post, setPost] = useState<Post | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Owner-only caption editing (rules also gate update/delete to authorUid)
  const [editing, setEditing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: currentUser } = useUserProfile(uid);
  const queryClient = useQueryClient();
  const isOwner = !!post && !!uid && post.authorUid === uid;

  const startEditing = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCaptionDraft(post?.caption ?? '');
    setEditError(null);
    setEditing(true);
  };

  async function handleSaveCaption() {
    if (!post || savingCaption) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavingCaption(true);
    setEditError(null);
    try {
      await updateDoc(doc(db, 'posts', post.id), { caption: captionDraft.trim() });
      setPost({ ...post, caption: captionDraft.trim() });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      setEditing(false);
    } catch (err) {
      console.error('[PostDetail] caption save failed:', err);
      setEditError("Couldn't save your changes. Try again in a moment.");
    } finally {
      setSavingCaption(false);
    }
  }

  function handleDeletePost() {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete this post?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'posts', post.id));
            queryClient.invalidateQueries({ queryKey: ['userPosts'] });
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            router.back();
          } catch (err) {
            console.error('[PostDetail] delete failed:', err);
            setEditError("Couldn't delete the post. Try again in a moment.");
          }
        },
      },
    ]);
  }

  // One-time post fetch
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'posts', id)).then((snap) => {
      if (snap.exists()) setPost({ id: snap.id, ...snap.data() } as Post);
      setPostLoading(false);
    });
  }, [id]);

  // Real-time comments listener
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, 'posts', id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)));
    });
    return unsub;
  }, [id]);

  async function handleSubmitComment() {
    if (!commentText.trim() || !uid || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts', id, 'comments'), {
        authorUid: uid,
        authorDisplayName: currentUser?.fullName ?? 'Traveler',
        authorAvatarUrl: currentUser?.avatarUrl ?? null,
        text: commentText.trim(),
        createdAt: serverTimestamp(),
      });
      setCommentText('');
    } finally {
      setSubmitting(false);
    }
  }

  if (postLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background.primary, justifyContent: 'flex-start', paddingTop: insets.top + Spacing['12'], paddingHorizontal: Spacing['5'], gap: Spacing['4'] }]}>
        <SkeletonBlock width="100%" height={280} radius={BorderRadius.xl} />
        <SkeletonListRow />
        <SkeletonListRow />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Post</Text>
        {isOwner ? (
          <TouchableOpacity
            onPress={startEditing}
            style={styles.backBtn}
            hitSlop={8}
            accessibilityLabel="Edit post"
          >
            <PencilSimple size={20} color={colors.text.primary} weight="regular" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {post?.mediaUrl ? (
          <Image source={{ uri: post.mediaUrl }} style={styles.media} resizeMode="cover" />
        ) : null}

        {post && (
          <View style={[styles.postInfo, { borderBottomColor: colors.background.cardBorder }]}>
            <TouchableOpacity
              style={styles.authorRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/user/${post.authorUid}`);
              }}
            >
              <Avatar uri={post.authorAvatarUrl} name={post.authorDisplayName} size="sm" />
              <View>
                <Text style={[styles.authorName, { color: colors.text.primary }]}>
                  {post.authorDisplayName}
                </Text>
                {/* Old posts denormalized the uid into authorUsername — never
                    show a raw uid as a handle */}
                {post.authorUsername && post.authorUsername !== post.authorUid ? (
                  <Text style={[styles.authorHandle, { color: colors.text.tertiary }]}>
                    @{post.authorUsername}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
            {editing ? (
              <View style={styles.editBlock}>
                <TextInput
                  value={captionDraft}
                  onChangeText={setCaptionDraft}
                  placeholder="Write a caption…"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  maxLength={500}
                  autoFocus
                  style={[
                    styles.captionInput,
                    {
                      color: colors.text.primary,
                      backgroundColor: colors.background.card,
                      borderColor: colors.background.cardBorder,
                    },
                  ]}
                />
                {editError ? (
                  <Text style={[styles.editError, { color: colors.semantic.error }]}>{editError}</Text>
                ) : null}
                <View style={styles.editActions}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    size="sm"
                    onPress={() => setEditing(false)}
                    haptic="light"
                    style={styles.editActionBtn}
                  />
                  <Button
                    label="Save"
                    variant="primary"
                    size="sm"
                    loading={savingCaption}
                    onPress={handleSaveCaption}
                    haptic="none"
                    style={styles.editActionBtn}
                  />
                </View>
                <Button
                  label="Delete post"
                  variant="danger"
                  size="sm"
                  fullWidth
                  onPress={handleDeletePost}
                  haptic="none"
                />
              </View>
            ) : (
              !!post.caption && (
                <Text style={[styles.caption, { color: colors.text.secondary }]}>{post.caption}</Text>
              )
            )}
            {!!post.placeName && (
              <View style={styles.placeRow}>
                <MapPin size={13} color={colors.brand.purple} weight="bold" />
                <Text style={[styles.place, { color: colors.brand.purple }]}>{post.placeName}</Text>
              </View>
            )}

            {post.mediaType === 'trip' && post.tripId && (
              <View style={[styles.tripCard, { backgroundColor: colors.background.elevated, borderColor: colors.background.cardBorder }]}>
                <View style={styles.tripCardHeader}>
                  <MapTrifold size={16} color={colors.brand.blue} weight="duotone" />
                  <Text style={[styles.tripCardLabel, { color: colors.brand.blue }]}>TRIP</Text>
                </View>
                {!!post.tripDestination && (
                  <Text style={[styles.tripCardDestination, { color: colors.text.primary }]}>
                    {post.tripDestination}
                  </Text>
                )}
                {!!post.tripDateRange && (
                  <Text style={[styles.tripCardDates, { color: colors.text.secondary }]}>
                    {post.tripDateRange}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.viewTripBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/trip/${post.tripId}`);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewTripText, { color: colors.brand.blue }]}>View trip</Text>
                  <ArrowRight size={13} color={colors.brand.blue} weight="bold" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={styles.commentsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>
            {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
          </Text>
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </View>
      </ScrollView>

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: colors.background.elevated,
            borderTopColor: colors.background.cardBorder,
            paddingBottom: insets.bottom + Spacing['2'],
          },
        ]}
      >
        <Avatar
          uri={currentUser?.avatarUrl ?? null}
          name={currentUser?.fullName ?? ''}
          size="xs"
        />
        <TextInput
          style={[styles.input, { color: colors.text.primary }]}
          placeholder="Add a comment..."
          placeholderTextColor={colors.text.tertiary}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity onPress={handleSubmitComment} disabled={!commentText.trim() || submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color={colors.brand.purple} />
          ) : (
            <Text
              style={[
                styles.sendBtn,
                { color: commentText.trim() ? colors.brand.purple : colors.text.tertiary },
              ]}
            >
              Post
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
  },
  backBtn: { width: 44, minHeight: 44, justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  scroll: { flex: 1 },
  media: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#111' },
  postInfo: {
    padding: Spacing['4'],
    gap: Spacing['3'],
    borderBottomWidth: 1,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  authorName: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  authorHandle: { fontSize: FontSize.sm },
  caption: { fontSize: FontSize.base, lineHeight: 22 },
  editBlock: { gap: Spacing['3'] },
  captionInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editError: { fontSize: FontSize.xs },
  editActions: { flexDirection: 'row', gap: Spacing['3'] },
  editActionBtn: { flex: 1 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  place: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  tripCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing['4'],
    gap: Spacing['1'],
  },
  tripCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    marginBottom: Spacing['1'],
  },
  tripCardLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  tripCardDestination: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  tripCardDates: {
    fontSize: FontSize.sm,
  },
  viewTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing['2'],
    alignSelf: 'flex-end',
    minHeight: 32,
  },
  viewTripText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  commentsSection: { padding: Spacing['4'], gap: Spacing['4'] },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing['1'] },
  commentRow: { flexDirection: 'row', gap: Spacing['3'], alignItems: 'flex-start' },
  commentContent: { flex: 1, gap: 2 },
  commentAuthor: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  commentText: { fontSize: FontSize.sm, lineHeight: 18 },
  commentTime: { fontSize: FontSize.xs },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    maxHeight: 100,
    paddingVertical: Spacing['1'],
  },
  sendBtn: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
