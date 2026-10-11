import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface VideoPlayerProps {
  uri: string;
  shouldPlay: boolean;
  muted: boolean;
  coverUrl: string | null;
  /** Landscape clips show whole over their blurred cover instead of losing their sides. */
  landscape: boolean;
}

/** A looping feed clip: cover first, fading out on the first frame; plays only while its card is active. */
export function VideoPlayer({ uri, shouldPlay, muted, coverUrl, landscape }: VideoPlayerProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const coverOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
      player.currentTime = 0;
    }
  }, [shouldPlay, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {landscape && coverUrl ? (
        <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} blurRadius={40} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={landscape ? 'contain' : 'cover'}
        nativeControls={false}
        onFirstFrameRender={() => Animated.timing(coverOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start()}
      />
      {coverUrl ? (
        <Animated.Image
          source={{ uri: coverUrl }}
          style={[StyleSheet.absoluteFill, { opacity: coverOpacity }]}
          resizeMode={landscape ? 'contain' : 'cover'}
        />
      ) : null}
    </View>
  );
}
