import { Animated } from 'react-native';

// The house spring — the ONLY spring config in the app (design system rule 6).
// tension/friction dialect; never mix with damping/stiffness in the same app.
export const SPRING = {
  tension: 65,
  friction: 11,
  useNativeDriver: true,
} as const;

export const Duration = {
  fast: 150, // press feedback, opacity toggles
  base: 250, // standard fades, element entrances
  slow: 400, // screen-level entrances, dark-immersion transitions
} as const;

export function springTo(value: Animated.Value, toValue: number): Animated.CompositeAnimation {
  return Animated.spring(value, { toValue, ...SPRING });
}

export function fadeTo(
  value: Animated.Value,
  toValue: number,
  duration: number = Duration.base
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration, useNativeDriver: true });
}
