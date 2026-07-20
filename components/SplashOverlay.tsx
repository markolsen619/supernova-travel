import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { DarkColors } from '@/constants/colors';
import { SPRING, Duration } from '@/constants/motion';
import { StarField } from '@/components/animations/StarField';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MINIMUM_MS = 1600;
const EXIT_MS = 300;

// SupernovaLogo.png is 1200×496 — keep the rendered box aspect-correct so
// resizeMode="contain" never letterboxes unpredictably.
const LOGO_WIDTH = SCREEN_WIDTH * 0.6;
const LOGO_HEIGHT = LOGO_WIDTH * (496 / 1200);

interface SplashOverlayProps {
  visible: boolean;
}

export function SplashOverlay({ visible }: SplashOverlayProps) {
  const [isMounted, setIsMounted] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const hasExited = useRef(false);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  // Overlay-level exit values — one fade for everything so the handoff to
  // whatever is underneath (dark welcome or light tabs) is a single clean
  // dissolve, never a race of per-element fades.
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const contentScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: Duration.base, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, ...SPRING }),
      ]),
    ]).start();
  }, []);

  // Minimum display timer
  useEffect(() => {
    const timer = setTimeout(() => setCanDismiss(true), MINIMUM_MS);
    return () => clearTimeout(timer);
  }, []);

  // Exit: fade the whole overlay while content scales up slightly —
  // stepping through the splash into the app.
  useEffect(() => {
    if (!visible && canDismiss && !hasExited.current) {
      hasExited.current = true;
      Animated.parallel([
        Animated.timing(contentScale, { toValue: 1.04, duration: EXIT_MS, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setIsMounted(false);
      });
    }
  }, [visible, canDismiss]);

  if (!isMounted) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
      <StarField starCount={45} opacity={0.5} />

      <Animated.View style={{ transform: [{ scale: contentScale }] }}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <Image
            source={require('@/assets/images/SupernovaLogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DarkColors.background.primary,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
});
