import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSpring,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight, LetterSpacing } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MINIMUM_MS = 2800;
const EXIT_MS = 350;

const ORBS = [
  { color: 'rgba(167,139,250,0.55)', size: 180, delay: 0,   dx: 22,  dy: -16 },
  { color: 'rgba(244,114,182,0.45)', size: 140, delay: 400, dx: -26, dy: 24  },
  { color: 'rgba(96,165,250,0.40)',  size: 110, delay: 800, dx: 16,  dy: 32  },
];

const WORDS = ['Travel', 'Further'];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface OrbViewProps {
  config: typeof ORBS[number];
  opacity: ReturnType<typeof useSharedValue<number>>;
  scale: ReturnType<typeof useSharedValue<number>>;
  tx: ReturnType<typeof useSharedValue<number>>;
  ty: ReturnType<typeof useSharedValue<number>>;
}

function OrbView({ config, opacity, scale, tx, ty }: OrbViewProps) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateX: tx.value },
      { translateY: ty.value },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          backgroundColor: config.color,
        },
        animStyle,
      ]}
    />
  );
}

interface WordViewProps {
  word: string;
  opacity: ReturnType<typeof useSharedValue<number>>;
  ty: ReturnType<typeof useSharedValue<number>>;
}

function WordView({ word, opacity, ty }: WordViewProps) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));
  return <Animated.Text style={[styles.mottoWord, animStyle]}>{word}</Animated.Text>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SplashOverlayProps {
  visible: boolean;
}

export function SplashOverlay({ visible }: SplashOverlayProps) {
  const [isMounted, setIsMounted] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const hasExited = useRef(false);

  // Orb shared values
  const orb0Opacity = useSharedValue(0.3); const orb1Opacity = useSharedValue(0.3); const orb2Opacity = useSharedValue(0.3);
  const orb0Scale   = useSharedValue(0.8); const orb1Scale   = useSharedValue(0.8); const orb2Scale   = useSharedValue(0.8);
  const orb0TX = useSharedValue(0); const orb0TY = useSharedValue(0);
  const orb1TX = useSharedValue(0); const orb1TY = useSharedValue(0);
  const orb2TX = useSharedValue(0); const orb2TY = useSharedValue(0);

  const orbOpacities = [orb0Opacity, orb1Opacity, orb2Opacity];
  const orbScales    = [orb0Scale,   orb1Scale,   orb2Scale  ];
  const orbTXs       = [orb0TX,      orb1TX,      orb2TX     ];
  const orbTYs       = [orb0TY,      orb1TY,      orb2TY     ];

  // Logo shared values
  const logoOpacity = useSharedValue(0);
  const logoScale   = useSharedValue(0.7);

  // Motto shared values
  const word0Opacity = useSharedValue(0); const word0TY = useSharedValue(8);
  const word1Opacity = useSharedValue(0); const word1TY = useSharedValue(8);
  const wordOpacities = [word0Opacity, word1Opacity];
  const wordTYs       = [word0TY,      word1TY     ];

  // Enter animations
  useEffect(() => {
    const pulseTiming = { duration: 2400, easing: Easing.inOut(Easing.sin) };
    const driftX      = { duration: 3200, easing: Easing.inOut(Easing.quad) };
    const driftY      = { duration: 2800, easing: Easing.inOut(Easing.quad) };

    ORBS.forEach((cfg, i) => {
      orbOpacities[i].value = withDelay(cfg.delay, withRepeat(withTiming(0.85, pulseTiming), -1, true));
      orbScales[i].value    = withDelay(cfg.delay, withRepeat(withTiming(1.25, pulseTiming), -1, true));
      orbTXs[i].value       = withDelay(cfg.delay, withRepeat(withTiming(cfg.dx, driftX), -1, true));
      orbTYs[i].value       = withDelay(cfg.delay, withRepeat(withTiming(cfg.dy, driftY), -1, true));
    });

    // Logo: spring in, then breathe loop
    logoOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    logoScale.value   = withDelay(200, withSequence(
      withSpring(1.0, { damping: 14, stiffness: 120 }),
      withRepeat(withTiming(1.03, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true)
    ));

    // Motto: staggered word reveal
    WORDS.forEach((_, i) => {
      const delay = 500 + i * 150;
      wordOpacities[i].value = withDelay(delay, withTiming(1, { duration: 300 }));
      wordTYs[i].value       = withDelay(delay, withTiming(0, { duration: 300 }));
    });
  }, []);

  // Minimum display timer
  useEffect(() => {
    const timer = setTimeout(() => setCanDismiss(true), MINIMUM_MS);
    return () => clearTimeout(timer);
  }, []);

  // Exit trigger
  useEffect(() => {
    if (!visible && canDismiss && !hasExited.current) {
      hasExited.current = true;
      const exitTiming = { duration: EXIT_MS };

      orbOpacities.forEach(sv => { sv.value = withTiming(0, exitTiming); });
      logoOpacity.value = withTiming(0, exitTiming);
      logoScale.value   = withTiming(1.03, exitTiming);
      wordOpacities.forEach((sv, i) => {
        if (i < wordOpacities.length - 1) {
          sv.value = withTiming(0, exitTiming);
        } else {
          sv.value = withTiming(0, exitTiming, (finished) => {
            if (finished) runOnJS(setIsMounted)(false);
          });
        }
      });
    }
  }, [visible, canDismiss]);

  // Must be before early return to satisfy Rules of Hooks
  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  if (!isMounted) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <LinearGradient
        colors={['#0a0a1a', '#1a0a3a'] as [string, string]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={styles.orbStage} pointerEvents="none">
        {ORBS.map((cfg, i) => (
          <OrbView
            key={i}
            config={cfg}
            opacity={orbOpacities[i]}
            scale={orbScales[i]}
            tx={orbTXs[i]}
            ty={orbTYs[i]}
          />
        ))}
      </View>

      <View style={styles.content}>
        <Animated.View style={[styles.logoWrap, logoAnimStyle]}>
          <Image
            source={require('@/assets/images/SupernovaLogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.mottoRow}>
          {WORDS.map((word, i) => (
            <WordView
              key={word}
              word={word}
              opacity={wordOpacities[i]}
              ty={wordTYs[i]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['6'],
  },
  logoWrap: {
    alignItems: 'center',
  },
  logo: {
    width: SCREEN_WIDTH * 0.6,
    height: 80,
  },
  mottoRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
    alignItems: 'center',
  },
  mottoWord: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.black,
    color: DarkColors.text.primary,
    letterSpacing: LetterSpacing.widest,
  },
});
