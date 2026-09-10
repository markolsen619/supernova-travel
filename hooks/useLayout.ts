import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  isLargeScreen, gridColumnsFor, contentMaxWidth,
} from '@/utils/layout';

/**
 * Reactive window size plus derived layout tokens.
 *
 * Replaces module-level `Dimensions.get('window')`, which is evaluated once at
 * import and frozen — fine while the app was portrait-locked on fixed-size
 * phones, wrong the moment a foldable resizes mid-session.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return useMemo(
    () => ({
      width,
      height,
      isLarge: isLargeScreen(width, height),
      columns: gridColumnsFor(width, height),
      maxContentWidth: contentMaxWidth(width, height),
    }),
    [width, height],
  );
}
