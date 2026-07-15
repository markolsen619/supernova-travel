import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, DimensionValue } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';

interface SkeletonBlockProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: object;
}

/** Pulsing placeholder block for brand-style loading states — see SKILL.md's
 * "skeletons, not spinners" rule. Pulse uses the house spring's timing scale,
 * not a shimmer sweep, to stay lightweight (no gradient/mask dependency).
 * The other shapes in this file (SkeletonText/Card/ListRow) all compose this. */
export function SkeletonBlock({ width = '100%', height, radius = BorderRadius.sm, style }: SkeletonBlockProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.background.sunken, opacity },
        style,
      ]}
    />
  );
}

/** A single placeholder text line. `size` picks the line's height, not a font
 * size — there's no text here to size, just a bar standing in for one. */
export function SkeletonText({
  width = '100%',
  size = 'base',
  style,
}: {
  width?: DimensionValue;
  size?: 'xs' | 'sm' | 'base' | 'lg';
  style?: object;
}) {
  const heightBySize = { xs: 10, sm: 12, base: 14, lg: 18 } as const;
  return <SkeletonBlock width={width} height={heightBySize[size]} radius={4} style={style} />;
}

/** Image/card-shaped rectangle — trip cards, feed cards, photo grid cells. */
export function SkeletonCard({
  width = '100%',
  height = 160,
  radius = BorderRadius.lg,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}) {
  return <SkeletonBlock width={width} height={height} radius={radius} style={style} />;
}

/** A typical list row: optional circular avatar + stacked title/subtitle
 * lines. Matches the majority shape of list content across the app (search
 * results, notifications, followers, wallet items). */
export function SkeletonListRow({ avatar = true }: { avatar?: boolean }) {
  return (
    <View style={styles.row}>
      {avatar && <SkeletonBlock width={44} height={44} radius={22} />}
      <View style={styles.rowText}>
        <SkeletonText width="55%" size="sm" />
        <SkeletonText width="35%" size="xs" style={{ marginTop: Spacing['1'] }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  rowText: {
    flex: 1,
  },
});
