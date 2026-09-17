import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';

interface ReadingColumnProps {
  children: React.ReactNode;
  /** Colour either side of the column. Defaults to the theme's page background. */
  surround?: string;
}

/**
 * Centres a whole screen at the reading measure on large screens (iPad, the
 * unfolded iPhone Duo). On phones it returns its children untouched, so the
 * phone layout is literally the same tree.
 *
 * Used as a navigator's screenLayout for the routes in utils/layout.ts
 * usesReadingColumn(), rather than inside each screen.
 */
export function ReadingColumn({ children, surround }: ReadingColumnProps) {
  const { isLarge, contentColumn } = useLayout();
  const { colors } = useTheme();
  if (!isLarge) return <>{children}</>;
  return (
    <View style={[styles.fill, { backgroundColor: surround ?? colors.background.primary }]}>
      <View style={[styles.fill, contentColumn]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
