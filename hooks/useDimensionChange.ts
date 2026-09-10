import { useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { didSizeChange, type Size } from '@/utils/layout';

/**
 * Calls `onChange` when the window resizes, with the new and previous sizes.
 *
 * Needed because a resize re-renders but does NOT remount: anything captured in
 * a `useRef` initialiser keeps its mount-time value forever. Several sheets seed
 * an Animated.Value with the screen height to mean "offscreen"; after the screen
 * grows, that position is on screen.
 */
export function useDimensionChange(onChange: (next: Size, prev: Size) => void): void {
  const { width, height } = useWindowDimensions();
  const prev = useRef<Size>({ width, height });
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const next: Size = { width, height };
    if (didSizeChange(prev.current, next)) {
      const before = prev.current;
      prev.current = next;
      cb.current(next, before);
    }
  }, [width, height]);
}
