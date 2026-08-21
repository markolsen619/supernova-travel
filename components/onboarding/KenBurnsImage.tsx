import { useEffect, useRef } from 'react';
import { Animated, ImageSourcePropType, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { StarMark } from '@/components/ui/StarMark';

interface KenBurnsImageProps {
  source: ImageSourcePropType | null;
  active: boolean;
  style?: ViewStyle;
  // Swipe-parallax scale driven by the parent slide's scroll position
  // (Task 6) — composed with this component's own continuous Ken Burns
  // scale as a second `transform` entry, not multiplied together manually.
  parallaxScale?: Animated.AnimatedInterpolation<number>;
}

// Branded fallback (sunken tint + star mark) shows immediately; the real
// photo cross-fades in over 300ms once it resolves, so there's never a dead
// frame. Continuous slow zoom/pan while `active` — skipped when Reduce
// Motion is on. See the onboarding redesign spec's Motion System.
export function KenBurnsImage({ source, active, style, parallaxScale }: KenBurnsImageProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduceMotion) {
      scale.setValue(1);
      translateY.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.15, duration: 10000, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -8, duration: 10000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 10000, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 10000, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, scale, translateY]);

  useEffect(() => {
    fade.setValue(0);
    if (source) {
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [source, fade]);

  const transform = parallaxScale
    ? [{ scale }, { translateY }, { scale: parallaxScale }]
    : [{ scale }, { translateY }];

  return (
    <View style={[styles.container, { backgroundColor: colors.background.sunken }, style]}>
      <View style={styles.fallback}>
        <StarMark size={40} />
      </View>
      {source ? (
        <Animated.Image
          source={source}
          style={[StyleSheet.absoluteFill, { opacity: fade, transform }]}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
