import React, { useCallback, useRef } from 'react';
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
  Heart,
  ChatCircle,
  Export,
  BookmarkSimple,
  MapPin,
  DotsThree,
} from 'phosphor-react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSavePost } from '@/hooks/useSavePost';
import { useOwnPostActions } from '@/hooks/useOwnPostActions';
import { Avatar } from '@/components/ui/Avatar';
import { resolvePostAuthor } from '@/utils/postAuthor';
import type { AuthorInfo } from '@/hooks/useAuthorProfiles';
import { Post } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface FeedActionsProps {
  post: Post;
  /**
   * Name and avatar resolved by the screen, preferring the author's live
   * profile over the post's denormalized copy. Passed in rather than
   * fetched here: a profile read inside a recycled list cell is the
   * cost/perf footgun TripCard's `author` prop already avoids.
   */
  author?: AuthorInfo;
  onCommentPress: () => void;
  onMorePress?: (post: Post, anchor: React.RefObject<View | null>) => void;
  /** Owned by FeedCard (usePostLike) so the heart and the double tap share one state. */
  liked: boolean;
  onLikePress: () => void;
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
export function FeedActions({ post, author, onCommentPress, onMorePress, liked, onLikePress }: FeedActionsProps) {
  const resolvedAuthor = resolvePostAuthor(post, author);
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { saved, toggleSave } = useSavePost(post);
  const { openOwnPostActions } = useOwnPostActions();

  const handleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLikePress();
  }, [onLikePress]);

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

  const moreRef = useRef<View>(null);
  const isOwnPost = !!uid && post.authorUid === uid;

  const handleMorePress = useCallback(() => {
    // Your own post: edit or delete it. Anyone else's: report or block.
    if (isOwnPost) {
      openOwnPostActions(post, moreRef);
      return;
    }
    onMorePress?.(post, moreRef);
  }, [onMorePress, post, isOwnPost, openOwnPostActions]);

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
          <Avatar uri={resolvedAuthor.avatarUrl} name={resolvedAuthor.name} size="sm" />
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

        {isOwnPost || onMorePress ? (
          <TouchableOpacity
            ref={moreRef}
            style={styles.actionBtn}
            onPress={handleMorePress}
            hitSlop={10}
            accessibilityLabel={isOwnPost ? "Edit or delete post" : "More options"}
          >
            <DotsThree size={28} color="rgba(255,255,255,0.9)" weight="bold" />
          </TouchableOpacity>
        ) : null}
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
