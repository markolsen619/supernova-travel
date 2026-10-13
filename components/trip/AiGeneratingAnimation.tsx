import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { StarMark } from '@/components/ui/StarMark';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface AiGeneratingAnimationProps {
  status: string;
  /** 0–1. Eases towards ~0.9 while waiting (utils/generatingStory progressAt); 1 when the trip is ready. */
  progress: number;
  /** The trip is ready: fill the ring and burst the star. */
  finishing: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 132;
const STROKE = 3;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface OrbProps {
  color: string;
  size: number;
  delayMs: number;
  translateXRange: number;
  translateYRange: number;
}

function Orb({ color, size, delayMs, translateXRange, translateYRange }: OrbProps) {
  const opacity    = useRef(new Animated.Value(0.3)).current;
  const scale      = useRef(new Animated.Value(0.8)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(value, { toValue, duration, useNativeDriver: true }),
        Animated.timing(value, { toValue: value === opacity ? 0.3 : value === scale ? 0.8 : 0, duration, useNativeDriver: true }),
      ]));

    Animated.sequence([
      Animated.delay(delayMs),
      Animated.parallel([
        Animated.loop(Animated.sequence([
          Animated.timing(opacity,    { toValue: 0.85,           duration: 2400, useNativeDriver: true }),
          Animated.timing(opacity,    { toValue: 0.3,            duration: 2400, useNativeDriver: true }),
        ])),
        Animated.loop(Animated.sequence([
          Animated.timing(scale,      { toValue: 1.25,           duration: 2400, useNativeDriver: true }),
          Animated.timing(scale,      { toValue: 0.8,            duration: 2400, useNativeDriver: true }),
        ])),
        Animated.loop(Animated.sequence([
          Animated.timing(translateX, { toValue: translateXRange, duration: 3200, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 0,              duration: 3200, useNativeDriver: true }),
        ])),
        Animated.loop(Animated.sequence([
          Animated.timing(translateY, { toValue: translateYRange, duration: 2800, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0,              duration: 2800, useNativeDriver: true }),
        ])),
      ]),
    ]).start();

    // suppress unused warning
    void loop;
  }, []);

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ scale }, { translateX }, { translateY }],
        },
      ]}
    />
  );
}

export function AiGeneratingAnimation({ status, progress, finishing }: AiGeneratingAnimationProps) {
  const statusOpacity = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    statusOpacity.setValue(0);
    Animated.timing(statusOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [status, statusOpacity]);

  // Glide to each new value over the tick (or quickly to full when done): a steady crawl, not jumps.
  useEffect(() => {
    Animated.timing(fill, {
      toValue: progress,
      duration: finishing ? 450 : 1000,
      easing: finishing ? Easing.out(Easing.cubic) : Easing.linear,
      useNativeDriver: false, // strokeDashoffset is not a native-driver prop
    }).start();
  }, [progress, finishing, fill]);

  useEffect(() => {
    if (!finishing) return;
    Animated.sequence([
      Animated.timing(burst, { toValue: 1.28, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(burst, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }),
    ]).start();
  }, [finishing, burst]);

  const dashOffset = fill.interpolate({ inputRange: [0, 1], outputRange: [CIRCUMFERENCE, 0] });

  return (
    <View style={styles.container}>
      <View style={styles.orbStage}>
        <Orb color="rgba(167,139,250,0.55)" size={160} delayMs={0}   translateXRange={18}  translateYRange={-14} />
        <Orb color="rgba(244,114,182,0.45)" size={120} delayMs={400} translateXRange={-22} translateYRange={20}  />
        <Orb color="rgba(96,165,250,0.40)"  size={90}  delayMs={800} translateXRange={14}  translateYRange={28}  />
        {/* Progress ring round the brand star — keeps moving through a one- to two-minute wait. */}
        <Svg width={RING} height={RING} style={styles.ring}>
          <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke="rgba(245,243,249,0.12)" strokeWidth={STROKE} fill="none" />
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={DarkColors.brand.purple}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <Animated.View style={{ transform: [{ scale: burst }] }}>
          <StarMark size={64} />
        </Animated.View>
      </View>
      <Animated.Text
        style={[styles.statusText, { opacity: statusOpacity }]}
        accessibilityLiveRegion="polite"
      >
        {status}
      </Animated.Text>
    </View>
  );
}

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
  orb: { position: 'absolute' },
  ring: { position: 'absolute' },
  statusText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: DarkColors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: Spacing['8'],
  },
});
