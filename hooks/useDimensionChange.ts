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

  // "Latest ref" pattern, as its own effect declared BEFORE the dimension
  // effect below — effects run in declaration order, so cb.current is
  // refreshed before the dimension effect can ever fire. Writing cb.current
  // directly in the render body (the more common form of this pattern) works
  // today, but under concurrent rendering a render that gets discarded can
  // leave cb.current pointing at a closure that never committed.
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    const next: Size = { width, height };
    if (didSizeChange(prev.current, next)) {
      const before = prev.current;
      prev.current = next;
      cb.current(next, before);
    }
    // onChange is deliberately excluded — every caller passes an inline
    // arrow with a fresh identity each render, and including it would
    // re-fire this effect on every render instead of only on an actual
    // resize. The ref above always has the latest callback by the time this
    // effect can run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);
}
