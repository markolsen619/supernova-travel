import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { VideoPlayer } from './VideoPlayer';
import { FeedActions } from './FeedActions';
import { Post } from '@/types';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

interface FeedCardProps {
  post: Post;
  isActive: boolean;
}

export function FeedCard({ post, isActive }: FeedCardProps) {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState(false);

  function handleCommentPress() {
    router.push(`/post/${post.id}`);
  }

  return (
    <View style={styles.container}>
      {/* Media layer */}
      {post.mediaType === 'video' ? (
        <VideoPlayer
          uri={post.mediaUrl}
          shouldPlay={isActive}
          isMuted={isMuted}
        />
      ) : (
        <Image
          source={{ uri: post.mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}

      {/* Bottom gradient for readability */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.75)']}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Overlaid controls */}
      <FeedActions
        post={post}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted((m) => !m)}
        onCommentPress={handleCommentPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.55,
  },
});
