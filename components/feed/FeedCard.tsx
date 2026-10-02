import { postImageUrls } from '@/utils/postImages';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MapTrifold, Heart, HeartBreak } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { VideoPlayer } from './VideoPlayer';
import { FeedActions } from './FeedActions';
import { usePostLike } from '@/hooks/usePostLike';
import { doubleTapLike } from '@/utils/postActions';
import { SPRING } from '@/constants/motion';
import { Post } from '@/types';
import type { AuthorInfo } from '@/hooks/useAuthorProfiles';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface FeedCardProps {
  post: Post;
  isActive: boolean;
  /** Resolved by the screen — see FeedActions. */
  author?: AuthorInfo;
  /** Opens report/block for someone else's post. The screen owns the menu, since cards are recycled. */
  onMorePress?: (post: Post, anchor: React.RefObject<View | null>) => void;
}

interface TripInfoBadgeProps {
  tripId: string;
  destination: string | null;
  dateRange: string | null;
}

function TripInfoBadge({ tripId, destination, dateRange }: TripInfoBadgeProps) {
  const router = useRouter();
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${tripId}`);
  }, [tripId, router]);

  return (
    <TouchableOpacity
      style={styles.tripBadge}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityLabel={destination ? `Open trip to ${destination}` : 'Open trip'}
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tripBadgeContent}>
        <View style={styles.tripBadgeHeader}>
          <MapTrifold size={14} color="#60a5fa" weight="duotone" />
          <Text style={styles.tripBadgeLabel}>TRIP</Text>
        </View>
        {destination && (
          <Text style={styles.tripBadgeDestination} numberOfLines={1}>{destination}</Text>
        )}
        {dateRange && (
          <Text style={styles.tripBadgeDates}>{dateRange}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * The double-tap feedback in the middle of the photo: a pink heart when you
 * like, a broken heart when a second double tap takes it back. Springs in with
 * the house spring, then fades.
 */
function HeartBurst({ kind }: { kind: 'like' | 'unlike' }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, ...SPRING }),
      Animated.timing(opacity, { toValue: 0, duration: 250, delay: 250, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);
  return (
    <Animated.View pointerEvents="none" style={[styles.burst, { opacity, transform: [{ scale }] }]}>
      {kind === 'like'
        ? <Heart size={110} color="#f472b6" weight="fill" />
        : <HeartBreak size={96} color="rgba(255,255,255,0.92)" weight="fill" />}
    </Animated.View>
  );
}

export function FeedCard({ post, isActive, author, onMorePress }: FeedCardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  // feedWidth is the window width on phones; a centred 9:16 column on large screens.
  const { feedWidth: width, height } = useLayout();
  const [photoIndex, setPhotoIndex] = useState(0);

  const handleCommentPress = useCallback(() => {
    router.push(`/post/${post.id}`);
  }, [post.id, router]);

  // One like state for the heart button and the double tap.
  const { liked, setLiked } = usePostLike(post.id);
  const handleLikePress = useCallback(() => { setLiked(!liked); }, [liked, setLiked]);
  const [burst, setBurst] = useState<{ kind: 'like' | 'unlike'; key: number } | null>(null);
  const handleDoubleTap = useCallback(() => {
    const next = doubleTapLike(liked);
    if (!setLiked(next.liked)) return; // a like is still saving — ignore, don't flash a heart
    Haptics.impactAsync(next.liked ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    setBurst({ kind: next.burst, key: Date.now() });
  }, [liked, setLiked]);
  // Double tap anywhere on the photo or video. Single taps, swipes between
  // photos and the buttons on top are untouched: the gesture only wraps the media.
  const doubleTap = useMemo(
    () => Gesture.Tap().numberOfTaps(2).maxDelay(250).runOnJS(true).onEnd((_e, success) => {
      if (success) handleDoubleTap();
    }),
    [handleDoubleTap],
  );

  // Resolve the array of image URLs, falling back to single mediaUrl for older posts
  const imageUrls = postImageUrls(post);
  const isMultiPhoto = post.mediaType === 'photo' && imageUrls.length > 1;

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      {/* Media layer — double tap to like, again to unlike */}
      <GestureDetector gesture={doubleTap}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
      {post.mediaType === 'video' ? (
        <VideoPlayer uri={post.mediaUrl} shouldPlay={isActive} isMuted={false} />
      ) : isMultiPhoto ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => {
            setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          style={StyleSheet.absoluteFill}
        >
          {imageUrls.map((uri, i) => (
            <Image
              key={`${uri}-${i}`}
              source={{ uri }}
              style={{ width, height }}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      ) : imageUrls.length > 0 ? (
        <Image source={{ uri: imageUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        // Post.mediaUrl is required, so this is unreachable in practice — kept
        // as a light, named placeholder (not a dark gradient) for parity with
        // the trip header's "no photo" fallback, in case that invariant ever slips.
        <View style={[StyleSheet.absoluteFill, styles.noMediaFallback, { backgroundColor: colors.background.sunken }]}>
          <MapTrifold size={32} color={colors.text.disabled} weight="duotone" />
        </View>
      )}
      </View>
      </GestureDetector>

      {burst ? <HeartBurst key={burst.key} kind={burst.kind} /> : null}

      {/* Bottom gradient for readability */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.75)'] as [string, string, string]}
        style={[styles.gradient, { height: height * 0.55 }]}
        pointerEvents="none"
      />

      {/* Photo carousel indicator */}
      {isMultiPhoto && (
        <View style={styles.indicatorWrapper} pointerEvents="none">
          <View style={styles.indicatorPill}>
            <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.indicatorRow}>
              {imageUrls.map((_, i) => (
                <View
                  key={i}
                  style={[styles.indicatorDot, i === photoIndex && styles.indicatorDotActive]}
                />
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Trip info badge */}
      {post.mediaType === 'trip' && post.tripId && (
        <TripInfoBadge
          tripId={post.tripId}
          destination={post.tripDestination ?? post.placeName}
          dateRange={post.tripDateRange}
        />
      )}

      {/* Overlaid controls */}
      <FeedActions post={post} author={author} onCommentPress={handleCommentPress} onMorePress={onMorePress} liked={liked} onLikePress={handleLikePress} />
    </View>
  );
}

const styles = StyleSheet.create({
  burst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  noMediaFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorWrapper: {
    position: 'absolute',
    bottom: 220,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  indicatorPill: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  indicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  indicatorDotActive: {
    width: 14,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  tripBadge: {
    position: 'absolute',
    left: Spacing['4'],
    bottom: 200,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    maxWidth: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tripBadgeContent: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    gap: 2,
  },
  tripBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    marginBottom: 2,
  },
  tripBadgeLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: '#60a5fa',
    letterSpacing: 1,
  },
  tripBadgeDestination: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#fff',
  },
  tripBadgeDates: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
  },
});
