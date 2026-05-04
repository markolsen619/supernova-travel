import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiGeneratingAnimationProps {
  status: string;
}

// ─── Orb sub-component ────────────────────────────────────────────────────────

interface OrbProps {
  color: string;
  size: number;
  delayMs: number;
  translateXRange: number;
  translateYRange: number;
}

function Orb({ color, size, delayMs, translateXRange, translateYRange }: OrbProps) {
  const opacity = useSharedValue(0.3);
  const scale = useSharedValue(0.8);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    const timing = { duration: 2400, easing: Easing.inOut(Easing.sin) };

    opacity.value = withDelay(
      delayMs,
      withRepeat(withTiming(0.85, timing), -1, true)
    );
    scale.value = withDelay(
      delayMs,
      withRepeat(withTiming(1.25, timing), -1, true)
    );
    translateX.value = withDelay(
      delayMs,
      withRepeat(withTiming(translateXRange, { duration: 3200, easing: Easing.inOut(Easing.quad) }), -1, true)
    );
    translateY.value = withDelay(
      delayMs,
      withRepeat(withTiming(translateYRange, { duration: 2800, easing: Easing.inOut(Easing.quad) }), -1, true)
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AiGeneratingAnimation({ status }: AiGeneratingAnimationProps) {
  const statusOpacity = useSharedValue(0);

  useEffect(() => {
    statusOpacity.value = withTiming(1, { duration: 400 });
  }, [status]);

  const statusStyle = useAnimatedStyle(() => ({
    opacity: statusOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Orb cluster */}
      <View style={styles.orbStage}>
        {/* Purple orb — large, center-ish */}
        <Orb
          color="rgba(167,139,250,0.55)"
          size={160}
          delayMs={0}
          translateXRange={18}
          translateYRange={-14}
        />
        {/* Pink orb — medium, offset right */}
        <Orb
          color="rgba(244,114,182,0.45)"
          size={120}
          delayMs={400}
          translateXRange={-22}
          translateYRange={20}
        />
        {/* Blue orb — small, offset left-top */}
        <Orb
          color="rgba(96,165,250,0.40)"
          size={90}
          delayMs={800}
          translateXRange={14}
          translateYRange={28}
        />
      </View>

      {/* Sparkle label above status */}
      <Text style={styles.sparkle}>✨</Text>

      {/* Status text — fades in on each change */}
      <Animated.Text style={[styles.statusText, statusStyle]}>
        {status}
      </Animated.Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['10'],
  },
  orbStage: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['8'],
  },
  orb: {
    position: 'absolute',
  },
  sparkle: {
    fontSize: 28,
    marginBottom: Spacing['3'],
  },
  statusText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: DarkColors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: Spacing['8'],
  },
});
