import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Dimensions, Animated } from 'react-native';
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

interface SplashOverlayProps {
  visible: boolean;
}

export function SplashOverlay({ visible }: SplashOverlayProps) {
  const [isMounted, setIsMounted] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const hasExited = useRef(false);

  const orbOpacities = useRef(ORBS.map(() => new Animated.Value(0.3))).current;
  const orbScales    = useRef(ORBS.map(() => new Animated.Value(0.8))).current;
  const orbTXs       = useRef(ORBS.map(() => new Animated.Value(0))).current;
  const orbTYs       = useRef(ORBS.map(() => new Animated.Value(0))).current;

  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.7)).current;

  const wordOpacities = useRef(WORDS.map(() => new Animated.Value(0))).current;
  const wordTYs       = useRef(WORDS.map(() => new Animated.Value(8))).current;

  // Enter animations
  useEffect(() => {
    ORBS.forEach((cfg, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(cfg.delay),
          Animated.parallel([
            Animated.loop(Animated.sequence([
              Animated.timing(orbOpacities[i], { toValue: 0.85, duration: 2400, useNativeDriver: true }),
              Animated.timing(orbOpacities[i], { toValue: 0.3,  duration: 2400, useNativeDriver: true }),
            ])),
            Animated.loop(Animated.sequence([
              Animated.timing(orbScales[i], { toValue: 1.25, duration: 2400, useNativeDriver: true }),
              Animated.timing(orbScales[i], { toValue: 0.8,  duration: 2400, useNativeDriver: true }),
            ])),
            Animated.loop(Animated.sequence([
              Animated.timing(orbTXs[i], { toValue: cfg.dx, duration: 3200, useNativeDriver: true }),
              Animated.timing(orbTXs[i], { toValue: 0,      duration: 3200, useNativeDriver: true }),
            ])),
            Animated.loop(Animated.sequence([
              Animated.timing(orbTYs[i], { toValue: cfg.dy, duration: 2800, useNativeDriver: true }),
              Animated.timing(orbTYs[i], { toValue: 0,      duration: 2800, useNativeDriver: true }),
            ])),
          ]),
        ])
      ).start();
    });

    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1.0, damping: 14, stiffness: 120, useNativeDriver: true }),
      ]),
    ]).start();

    WORDS.forEach((_, i) => {
      const delay = 500 + i * 150;
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(wordOpacities[i], { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(wordTYs[i],       { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
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
      const exitTiming = { duration: EXIT_MS, useNativeDriver: true } as const;
      const allOpacities = [...orbOpacities, logoOpacity, ...wordOpacities];
      const last = allOpacities.length - 1;
      allOpacities.forEach((sv, i) => {
        if (i < last) {
          Animated.timing(sv, { toValue: 0, ...exitTiming }).start();
        } else {
          Animated.timing(sv, { toValue: 0, ...exitTiming }).start(({ finished }) => {
            if (finished) setIsMounted(false);
          });
        }
      });
    }
  }, [visible, canDismiss]);

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
          <Animated.View
            key={i}
            style={[
              styles.orb,
              {
                width: cfg.size,
                height: cfg.size,
                borderRadius: cfg.size / 2,
                backgroundColor: cfg.color,
                opacity: orbOpacities[i],
                transform: [
                  { scale: orbScales[i] },
                  { translateX: orbTXs[i] },
                  { translateY: orbTYs[i] },
                ],
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.content}>
        <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Image
            source={require('@/assets/images/SupernovaLogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.mottoRow}>
          {WORDS.map((word, i) => (
            <Animated.Text
              key={word}
              style={[
                styles.mottoWord,
                { opacity: wordOpacities[i], transform: [{ translateY: wordTYs[i] }] },
              ]}
            >
              {word}
            </Animated.Text>
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
