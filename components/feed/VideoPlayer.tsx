import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

interface VideoPlayerProps {
  uri: string;
  shouldPlay: boolean;
  isMuted: boolean;
  style?: object;
}

export function VideoPlayer({ uri, shouldPlay, isMuted, style }: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (shouldPlay) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
      videoRef.current.setPositionAsync(0);
    }
  }, [shouldPlay]);

  useEffect(() => {
    videoRef.current?.setIsMutedAsync(isMuted);
  }, [isMuted]);

  return (
    <Video
      ref={videoRef}
      source={{ uri }}
      style={[StyleSheet.absoluteFill, style]}
      resizeMode={ResizeMode.COVER}
      isLooping
      isMuted={isMuted}
      shouldPlay={false}
    />
  );
}
