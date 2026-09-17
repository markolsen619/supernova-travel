import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  isLargeScreen, gridColumnsFor, galleryColumnsFor, contentMaxWidth, contentColumnStyle, feedColumnWidth,
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
    () => {
      const maxContentWidth = contentMaxWidth(width, height);
      return {
        width,
        height,
        isLarge: isLargeScreen(width, height),
        columns: gridColumnsFor(width, height),
        galleryColumns: galleryColumnsFor(width, height),
        maxContentWidth,
        /** Spread onto a screen's content container to centre it at the reading measure on large screens. */
        contentColumn: contentColumnStyle(maxContentWidth),
        feedWidth: feedColumnWidth(width, height),
      };
    },
    [width, height],
  );
}
