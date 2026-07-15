import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Sparkle } from 'phosphor-react-native';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface AiGeneratingAnimationProps {
  status: string;
}

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

export function AiGeneratingAnimation({ status }: AiGeneratingAnimationProps) {
  const statusOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    statusOpacity.setValue(0);
    Animated.timing(statusOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [status]);

  return (
    <View style={styles.container}>
      <View style={styles.orbStage}>
        <Orb color="rgba(167,139,250,0.55)" size={160} delayMs={0}   translateXRange={18}  translateYRange={-14} />
        <Orb color="rgba(244,114,182,0.45)" size={120} delayMs={400} translateXRange={-22} translateYRange={20}  />
        <Orb color="rgba(96,165,250,0.40)"  size={90}  delayMs={800} translateXRange={14}  translateYRange={28}  />
      </View>
      <Sparkle size={28} color={DarkColors.brand.purple} weight="duotone" style={styles.sparkle} />
      <Animated.Text style={[styles.statusText, { opacity: statusOpacity }]}>
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
  sparkle: {
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
