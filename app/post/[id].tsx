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
  getDoc,
} from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/ui/Avatar';
import { Comment, Post } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
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

  const { data: currentUser } = useUserProfile(uid);

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
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts', id, 'comments'), {
        authorUid: uid,
        authorDisplayName: currentUser?.displayName ?? 'Traveler',
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
      <View style={[styles.loading, { backgroundColor: colors.background.primary }]}>
        <ActivityIndicator color={colors.brand.purple} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backIcon, { color: colors.text.primary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Post</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {post?.mediaUrl ? (
          <Image source={{ uri: post.mediaUrl }} style={styles.media} resizeMode="cover" />
        ) : null}

        {post && (
          <View style={[styles.postInfo, { borderBottomColor: colors.background.cardBorder }]}>
            <TouchableOpacity
              style={styles.authorRow}
              onPress={() => router.push(`/user/${post.authorUid}`)}
            >
              <Avatar uri={post.authorAvatarUrl} name={post.authorDisplayName} size="sm" />
              <View>
                <Text style={[styles.authorName, { color: colors.text.primary }]}>
                  {post.authorDisplayName}
                </Text>
                <Text style={[styles.authorHandle, { color: colors.text.tertiary }]}>
                  @{post.authorUsername}
                </Text>
              </View>
            </TouchableOpacity>
            {!!post.caption && (
              <Text style={[styles.caption, { color: colors.text.secondary }]}>{post.caption}</Text>
            )}
            {!!post.placeName && (
              <Text style={[styles.place, { color: colors.brand.purple }]}>
                📍 {post.placeName}
              </Text>
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
          name={currentUser?.displayName ?? ''}
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
  backBtn: { width: 40 },
  backIcon: { fontSize: 24 },
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
  place: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
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
