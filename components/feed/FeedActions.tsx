import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  doc,
  runTransaction,
  serverTimestamp,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import {
  Heart,
  ChatCircle,
  Export,
  SpeakerSimpleX,
  SpeakerSimpleHigh,
  MapPin,
} from 'phosphor-react-native';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Avatar } from '@/components/ui/Avatar';
import { Post } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface FeedActionsProps {
  post: Post;
  isMuted: boolean;
  onToggleMute: () => void;
  onCommentPress: () => void;
}

function likeDocId(uid: string, postId: string) {
  return `${uid}_${postId}`;
}

// Every icon/text in this file sits on top of an arbitrary user photo or
// video, not app chrome — white + shadow is the correct legibility pattern
// here regardless of the app's light/dark theme (same reasoning as
// Instagram/TikTok's overlay controls), so none of this reads from useTheme().
export function FeedActions({ post, isMuted, onToggleMute, onCommentPress }: FeedActionsProps) {
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(post.likesCount);

  async function handleLike() {
    if (!uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const likeRef = doc(db, 'posts', post.id, 'likes', likeDocId(uid, post.id));
    const postRef = doc(db, 'posts', post.id);
    if (liked) {
      setLiked(false);
      setLocalLikes((n) => Math.max(0, n - 1));
      await runTransaction(db, async (tx) => {
        tx.delete(likeRef);
        const snap = await tx.get(postRef);
        tx.update(postRef, { likesCount: Math.max(0, (snap.data()?.likesCount ?? 1) - 1) });
      });
    } else {
      setLiked(true);
      setLocalLikes((n) => n + 1);
      await runTransaction(db, async (tx) => {
        tx.set(likeRef, { uid, createdAt: serverTimestamp() });
        const snap = await tx.get(postRef);
        tx.update(postRef, { likesCount: (snap.data()?.likesCount ?? 0) + 1 });
      });
    }
  }

  const handleCommentPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCommentPress();
  }, [onCommentPress]);

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Share', 'Sharing coming soon!');
  }, []);

  const handleToggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleMute();
  }, [onToggleMute]);

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
          onPress={handleToggleMute}
          hitSlop={10}
          accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted
            ? <SpeakerSimpleX size={28} color="rgba(255,255,255,0.9)" weight="regular" />
            : <SpeakerSimpleHigh size={28} color="rgba(255,255,255,0.9)" weight="duotone" />
          }
        </TouchableOpacity>
      </View>

      {/* Bottom caption area */}
      <View style={styles.captionArea}>
        <TouchableOpacity onPress={handleAuthorPress} hitSlop={6}>
          <Text style={styles.authorName}>@{post.authorUsername}</Text>
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
  actionCount: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
