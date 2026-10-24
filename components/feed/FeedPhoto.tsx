import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ArrowClockwise, ImageSquare } from 'phosphor-react-native';
import { FontSize, FontWeight } from '@/constants/typography';

/**
 * One feed photo. Before 2026-10-23 the feed used React Native's Image on a black card: a slow
 * 3–7 MB photo, or a HEIC one Android can't draw, was a black screen with no way to tell the two
 * apart. expo-image keeps photos on disk and recycles cleanly in the FlashList; while loading the
 * card shows a quiet photo mark, and a failure says so and offers a retry.
 * The feed card is always dark (full-bleed media), so these colours are fixed rather than themed.
 */
export function FeedPhoto({ uri, style }: { uri: string; style: StyleProp<ViewStyle> }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState('loading');
    setAttempt((n) => n + 1);
  }, []);
  const onLoad = useCallback(() => setState('loaded'), []);
  const onError = useCallback(() => setState('failed'), []);

  return (
    <View style={style}>
      {state !== 'loaded' ? (
        <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents={state === 'failed' ? 'auto' : 'none'}>
          {state === 'failed' ? (
            <TouchableOpacity onPress={retry} style={styles.retry} accessibilityRole="button" accessibilityLabel="Couldn't load this photo. Tap to try again">
              <ArrowClockwise size={26} color="rgba(255,255,255,0.7)" weight="bold" />
              <Text style={styles.retryTitle}>Couldn&apos;t load this photo</Text>
              <Text style={styles.retryBody}>Tap to try again</Text>
            </TouchableOpacity>
          ) : (
            <ImageSquare size={32} color="rgba(255,255,255,0.18)" weight="duotone" />
          )}
        </View>
      ) : null}
      {state !== 'failed' ? (
        <Image
          key={attempt}
          source={{ uri }}
          recyclingKey={uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          transition={200}
          onLoad={onLoad}
          onError={onError}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#141218', alignItems: 'center', justifyContent: 'center' },
  retry: { alignItems: 'center', gap: 6, padding: 24, minWidth: 44, minHeight: 44 },
  retryTitle: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.md, fontWeight: FontWeight.medium },
  retryBody: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
});
