import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  serverTimestamp,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonBlock, SkeletonListRow } from '@/components/ui/Skeleton';
import { Comment } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { MapTrifold, ArrowLeft, MapPin, ArrowRight, PencilSimple, TrashSimple, DotsThree, EyeSlash } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useUserProfile } from '@/hooks/useUserProfile';
import { resolvePostAuthor } from '@/utils/postAuthor';
import { usePost } from '@/hooks/usePost';
import { useModeration } from '@/hooks/useModeration';
import { useContentActions } from '@/components/moderation/useContentActions';
import { EmptyState } from '@/components/ui/EmptyState';
import { contentKey, filterVisible, isContentVisible } from '@/utils/moderation';
import { containsObjectionableText, OBJECTIONABLE_TEXT_MESSAGE } from '@/utils/contentFilter';

function formatTimestamp(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function CommentRow({
  comment,
  postId,
  currentUid,
  onMore,
}: {
  comment: Comment;
  postId: string;
  currentUid: string;
  onMore: (comment: Comment, anchor: React.RefObject<View | null>) => void;
}) {
  const { colors } = useTheme();
  const isMine = !!currentUid && comment.authorUid === currentUid;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const moreRef = useRef<View>(null);

  const startEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft(comment.text);
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = async () => {
    if (!draft.trim() || saving) return;
    if (containsObjectionableText(draft)) {
      setEditError(OBJECTIONABLE_TEXT_MESSAGE);
      return;
    }
    setEditError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      await updateDoc(doc(db, 'posts', postId, 'comments', comment.id), { text: draft.trim() });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete this comment?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteDoc(doc(db, 'posts', postId, 'comments', comment.id));
        },
      },
    ]);
  };

  return (
    <View style={styles.commentRow}>
      <Avatar uri={comment.authorAvatarUrl} name={comment.authorDisplayName} size="xs" />
      <View style={styles.commentContent}>
        <Text style={[styles.commentAuthor, { color: colors.text.primary }]}>
          {comment.authorDisplayName}
        </Text>
        {isEditing ? (
          <View style={styles.commentEditBlock}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              style={[styles.commentEditInput, { color: colors.text.primary, borderColor: colors.background.cardBorder }]}
              multiline
              maxLength={500}
              autoFocus
            />
            {editError ? (
              <Text style={[styles.commentError, { color: colors.semantic.error }]}>{editError}</Text>
            ) : null}
            <View style={styles.commentEditActions}>
              <TouchableOpacity onPress={cancelEdit} hitSlop={8} style={styles.commentEditActionBtn}>
                <Text style={[styles.commentEditActionText, { color: colors.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} disabled={saving} hitSlop={8} style={styles.commentEditActionBtn}>
                <Text style={[styles.commentEditActionText, { color: colors.brand.purple }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[styles.commentText, { color: colors.text.secondary }]}>
            {comment.text}
          </Text>
        )}
      </View>
      {!isEditing && (
        <View style={styles.commentMeta}>
          <Text style={[styles.commentTime, { color: colors.text.tertiary }]}>
            {formatTimestamp(comment.createdAt as unknown as { toDate?: () => Date })}
          </Text>
          {!isMine && (
            <TouchableOpacity
              ref={moreRef}
              onPress={() => onMore(comment, moreRef)}
              accessibilityLabel="More options for this comment"
              style={styles.commentIconBtn}
            >
              <DotsThree size={16} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          )}
          {isMine && (
            <View style={styles.commentOwnerActions}>
              <TouchableOpacity onPress={startEdit} hitSlop={8} accessibilityLabel="Edit comment" style={styles.commentIconBtn}>
                <PencilSimple size={13} color={colors.text.tertiary} weight="regular" />
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} hitSlop={8} accessibilityLabel="Delete comment" style={styles.commentIconBtn}>
                <TrashSimple size={13} color={colors.text.tertiary} weight="regular" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  const { data: post, isLoading: postLoading } = usePost(id ?? null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const { data: currentUser } = useUserProfile(uid);
  // Same staleness as the feed: the post's denormalized copy is frozen at
  // creation, so read the author's live profile and fall back to it.
  const { data: authorProfile } = useUserProfile(post?.authorUid ?? '');
  const author = post
    ? resolvePostAuthor(post, authorProfile
        ? { name: authorProfile.fullName, avatarUrl: authorProfile.avatarUrl }
        : undefined)
    : null;
  const moderation = useModeration();
  const { openActions, reportSheet, unblock } = useContentActions();
  const postMoreRef = useRef<View>(null);

  const visibleComments = useMemo(
    () =>
      filterVisible(comments, moderation, (c) => ({
        authorUid: c.authorUid,
        key: contentKey({ type: 'comment', id: c.id, parentId: id }),
        moderationHidden: c.moderationHidden,
      })),
    [comments, moderation, id],
  );

  const handleCommentMore = useCallback(
    (comment: Comment, anchor: React.RefObject<View | null>) => {
      if (!id) return;
      openActions({
        target: { type: 'comment', id: comment.id, parentId: id, ownerUid: comment.authorUid },
        ownerName: comment.authorDisplayName || 'this traveler',
        anchor,
      });
    },
    [id, openActions],
  );

  const handlePostMore = useCallback(() => {
    if (!post) return;
    openActions({
      target: { type: 'post', id: post.id, ownerUid: post.authorUid },
      ownerName: post.authorDisplayName || 'this traveler',
      anchor: postMoreRef,
    });
  }, [post, openActions]);
  const isOwner = !!post && !!uid && post.authorUid === uid;

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
    if (containsObjectionableText(commentText)) {
      setCommentError(OBJECTIONABLE_TEXT_MESSAGE);
      return;
    }
    setCommentError(null);
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
    } catch {
      // Includes the rules refusing a comment on a post whose author blocked you.
      setCommentError("Your comment wasn't posted. Try again.");
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

  const authorBlocked = !!post && moderation.blockedUids.has(post.authorUid);
  const postHidden =
    !!post &&
    !isOwner &&
    !isContentVisible(moderation, {
      authorUid: post.authorUid,
      key: contentKey({ type: 'post', id: post.id }),
      moderationHidden: post.moderationHidden,
    });

  if (postHidden) {
    return (
      <View style={[styles.unavailable, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
        <EmptyState
          icon={EyeSlash}
          title={authorBlocked ? `You blocked ${post.authorDisplayName || 'this traveler'}` : "This post isn't available"}
          description={
            authorBlocked
              ? 'Unblock them to see their posts, trips, and comments again.'
              : "It was reported and removed from your feed. We'll review it within 24 hours."
          }
          actionLabel="Go back"
          onAction={() => router.back()}
          actionHaptic="light"
          secondaryLabel={authorBlocked ? 'Unblock' : undefined}
          onSecondary={authorBlocked ? () => unblock(post.authorUid, post.authorDisplayName || 'this traveler') : undefined}
        />
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
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/post/edit/${post.id}`); }}
            style={styles.backBtn}
            hitSlop={8}
            accessibilityLabel="Edit post"
          >
            <PencilSimple size={20} color={colors.text.primary} weight="regular" />
          </TouchableOpacity>
        ) : post ? (
          <TouchableOpacity
            ref={postMoreRef}
            onPress={handlePostMore}
            style={styles.moreBtn}
            accessibilityLabel="More options for this post"
          >
            <DotsThree size={22} color={colors.text.primary} weight="bold" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag">
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
              <Avatar uri={author?.avatarUrl ?? null} name={author?.name ?? post.authorDisplayName} size="sm" />
              <View>
                <Text style={[styles.authorName, { color: colors.text.primary }]}>
                  {author?.name ?? post.authorDisplayName}
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
            {!!post.caption && (
              <Text style={[styles.caption, { color: colors.text.secondary }]}>{post.caption}</Text>
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
            {visibleComments.length} {visibleComments.length === 1 ? 'Comment' : 'Comments'}
          </Text>
          {visibleComments.map((c) => (
            <CommentRow key={c.id} comment={c} postId={id!} currentUid={uid} onMore={handleCommentMore} />
          ))}
        </View>
      </ScrollView>

      {commentError ? (
        <Text
          style={[styles.commentBarError, { color: colors.semantic.error, backgroundColor: colors.background.elevated }]}
          accessibilityLiveRegion="polite"
        >
          {commentError}
        </Text>
      ) : null}
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
          onChangeText={(t) => {
            setCommentText(t);
            if (commentError) setCommentError(null);
          }}
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
      {reportSheet}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  unavailable: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing['5'] },
  moreBtn: { width: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  commentError: { fontSize: FontSize.xs, lineHeight: FontSize.xs * 1.5 },
  commentBarError: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['2'],
  },
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
  commentMeta: { alignItems: 'flex-end', gap: 6 },
  commentOwnerActions: { flexDirection: 'row', gap: 10 },
  commentIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  commentEditBlock: { gap: 6 },
  commentEditInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    fontSize: FontSize.sm,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  commentEditActions: { flexDirection: 'row', gap: Spacing['4'] },
  commentEditActionBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing['1'] },
  commentEditActionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
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
