import { Animated } from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';

// Shared swipe-parallax interpolation for onboarding slides (Task 6) — the
// incoming photo/avatar-grid scales in from 1.05 -> 1.0 as it reaches the
// centered position. Gated by Reduce Motion per the spec's Motion System /
// Accessibility decision: when reduce motion is on, this returns `undefined`
// so callers omit the parallax transform entirely rather than applying it
// unconditionally.
export function useSwipeParallax(
  scrollX: Animated.Value,
  index: number,
  width: number
): Animated.AnimatedInterpolation<number> | undefined {
  const reduceMotion = useReduceMotion();

  const parallaxScale = scrollX.interpolate({
    inputRange: [(index - 1) * width, index * width, (index + 1) * width],
    outputRange: [1.05, 1, 1.05],
    extrapolate: 'clamp',
  });

  return reduceMotion ? undefined : parallaxScale;
}
