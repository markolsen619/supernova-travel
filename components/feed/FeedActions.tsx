import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  doc,
  runTransaction,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import {
  Heart,
  ChatCircle,
  Export,
  BookmarkSimple,
  MapPin,
} from 'phosphor-react-native';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSavePost } from '@/hooks/useSavePost';
import { Avatar } from '@/components/ui/Avatar';
import { Post } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface FeedActionsProps {
  post: Post;
  onCommentPress: () => void;
}

function likeDocId(uid: string, postId: string) {
  return `${uid}_${postId}`;
}

/** Never show a raw uid: posts created before usernames existed denormalized
 * the uid into authorUsername — fall back to displayName, then a default. */
function authorHandle(post: Post): string {
  if (post.authorUsername && post.authorUsername !== post.authorUid) {
    return `@${post.authorUsername}`;
  }
  return post.authorDisplayName || 'Traveler';
}

// Every icon/text in this file sits on top of an arbitrary user photo or
// video, not app chrome — white + shadow is the correct legibility pattern
// here regardless of the app's light/dark theme (same reasoning as
// Instagram/TikTok's overlay controls), so none of this reads from useTheme().
export function FeedActions({ post, onCommentPress }: FeedActionsProps) {
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const { saved, toggleSave } = useSavePost(post);

  // Seed the real liked state — one cheap keyed read per card
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, 'posts', post.id, 'likes', likeDocId(uid, post.id)))
      .then((snap) => { if (!cancelled) setLiked(snap.exists()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uid, post.id]);

  const handleLike = useCallback(async () => {
    if (!uid || likeBusy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = !liked;
    setLiked(next); // optimistic
    setLikeBusy(true);
    const likeRef = doc(db, 'posts', post.id, 'likes', likeDocId(uid, post.id));
    const postRef = doc(db, 'posts', post.id);
    try {
      // Transactions require every read before the first write
      await runTransaction(db, async (tx) => {
        const likeSnap = await tx.get(likeRef);
        const postSnap = await tx.get(postRef);
        const count = postSnap.data()?.likesCount ?? 0;
        if (next && !likeSnap.exists()) {
          tx.set(likeRef, { uid, createdAt: serverTimestamp() });
          tx.update(postRef, { likesCount: count + 1 });
        } else if (!next && likeSnap.exists()) {
          tx.delete(likeRef);
          tx.update(postRef, { likesCount: Math.max(0, count - 1) });
        }
      });
    } catch (err) {
      console.error('[FeedActions] like failed:', err);
      setLiked(!next); // revert optimistic state
    } finally {
      setLikeBusy(false);
    }
  }, [uid, likeBusy, liked, post.id]);

  const handleCommentPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCommentPress();
  }, [onCommentPress]);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const placePart = post.placeName ? ` from ${post.placeName}` : '';
    const link = post.tripId ? `supernova://trip/${post.tripId}` : `supernova://post/${post.id}`;
    try {
      await Share.share({
        message: `${post.authorDisplayName}'s travel moment${placePart} on Supernova${post.caption ? ` — "${post.caption}"` : ''}\n${link}`,
      });
    } catch {
      // User dismissed the sheet — nothing to handle
    }
  }, [post.authorDisplayName, post.placeName, post.caption, post.tripId, post.id]);

  const handleSave = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleSave();
  }, [toggleSave]);

  const handleAuthorPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/user/${post.authorUid}`);
  }, [router, post.authorUid]);

  return (
    <>
      {/* Right action column */}
      <View style={styles.actionsColumn}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleAuthorPress}
          hitSlop={10}
          accessibilityLabel={`View ${post.authorDisplayName}'s profile`}
        >
          <Avatar uri={post.authorAvatarUrl} name={post.authorDisplayName} size="sm" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleLike}
          hitSlop={10}
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        >
          <Heart
            size={28}
            color={liked ? '#f472b6' : 'rgba(255,255,255,0.9)'}
            weight={liked ? 'fill' : 'regular'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleCommentPress}
          hitSlop={10}
          accessibilityLabel="Comment"
        >
          <ChatCircle size={28} color="rgba(255,255,255,0.9)" weight="duotone" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleShare}
          hitSlop={10}
          accessibilityLabel="Share"
        >
          <Export size={28} color="rgba(255,255,255,0.9)" weight="regular" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleSave}
          hitSlop={10}
          accessibilityLabel={saved ? 'Remove from saved' : 'Save for later'}
        >
          <BookmarkSimple
            size={28}
            color={saved ? '#fbbf24' : 'rgba(255,255,255,0.9)'}
            weight={saved ? 'fill' : 'regular'}
          />
        </TouchableOpacity>
      </View>

      {/* Bottom caption area */}
      <View style={styles.captionArea}>
        <TouchableOpacity onPress={handleAuthorPress} hitSlop={6}>
          <Text style={styles.authorName}>{authorHandle(post)}</Text>
        </TouchableOpacity>
        {!!post.caption && (
          <Text style={styles.caption} numberOfLines={2}>
            {post.caption}
          </Text>
        )}
        {!!post.placeName && (
          <View style={styles.placeRow}>
            <MapPin size={14} color="rgba(255,255,255,0.8)" weight="duotone" />
            <Text style={styles.placeName}>{post.placeName}</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  actionsColumn: {
    position: 'absolute',
    right: Spacing['4'],
    bottom: 120,
    alignItems: 'center',
    gap: Spacing['5'],
  },
  actionBtn: {
    alignItems: 'center',
    gap: 2,
  },
  captionArea: {
    position: 'absolute',
    bottom: 110,
    left: Spacing['4'],
    right: 80,
    gap: Spacing['1'],
  },
  authorName: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  caption: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 18,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  placeName: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
