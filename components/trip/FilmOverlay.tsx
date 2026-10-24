import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export type FilmPhase = 'opening' | 'flying' | 'end';

const STAR = require('@/assets/images/SupernovaStar.png');

/** What the trip video shows over the map (spec 2026-10-24-trip-video-design.md §2): mark, opening title, day captions, end card. */
export function FilmOverlay({ phase, eyebrow, title, caption }: { phase: FilmPhase; eyebrow: string; title: string; caption: string | null }) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const captionFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [phase, fade]);

  useEffect(() => {
    captionFade.setValue(0);
    Animated.timing(captionFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [caption, captionFade]);

  if (phase === 'end') {
    return (
      <Animated.View style={[StyleSheet.absoluteFill, styles.end, { opacity: fade }]} pointerEvents="none">
        <Image source={STAR} style={styles.endStar} />
        <Text style={styles.endTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.endLine}>Plan yours on Supernova</Text>
      </Animated.View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.mark, { top: insets.top + Spacing['3'] }]}>
        <Image source={STAR} style={styles.markStar} />
        <Text style={styles.markText}>Supernova</Text>
      </View>
      {phase === 'opening' ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.opening, { opacity: fade }]}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.openingTitle} numberOfLines={3}>{title}</Text>
        </Animated.View>
      ) : caption ? (
        <Animated.View style={[styles.captionWrap, { bottom: insets.bottom + Spacing['10'], opacity: captionFade }]}>
          <Text style={styles.caption}>{caption}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  mark: { position: 'absolute', right: Spacing['5'], flexDirection: 'row', alignItems: 'center', gap: 6 },
  markStar: { width: 22, height: 22 },
  markText: { color: '#fff', fontSize: 13, fontWeight: FontWeight.semiBold, ...shadow },
  opening: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing['8'], backgroundColor: 'rgba(11,10,18,0.55)', gap: Spacing['2'] },
  eyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: FontWeight.medium, letterSpacing: 1.2, textAlign: 'center' },
  openingTitle: { color: '#fff', fontSize: 30, fontWeight: FontWeight.semiBold, letterSpacing: -0.6, textAlign: 'center', ...shadow },
  captionWrap: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  caption: { color: '#fff', fontSize: 13, fontWeight: FontWeight.semiBold, letterSpacing: 1.1 },
  end: { backgroundColor: '#0B0A12', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing['8'], gap: Spacing['3'] },
  endStar: { width: 64, height: 64 },
  endTitle: { color: '#F5F3F9', fontSize: 26, fontWeight: FontWeight.semiBold, textAlign: 'center' },
  endLine: { color: '#9C95AD', fontSize: 15 },
});
