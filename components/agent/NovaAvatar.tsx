import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';

/** Nova's face: the star in a round badge with a soft brand glow; it breathes while Nova thinks (spec §1). */
export function NovaAvatar({ size = 28, thinking = false }: { size?: number; thinking?: boolean }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || !thinking || reduce) { pulse.setValue(1); return; }
      loop = Animated.loop(Animated.sequence([
        Animated.spring(pulse, { toValue: 1.08, tension: 65, friction: 11, useNativeDriver: true }),
        Animated.spring(pulse, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }),
      ]));
      loop.start();
    });
    return () => { cancelled = true; loop?.stop(); };
  }, [thinking, pulse]);
  const ring: [string, string] = [colors.brand.purple, colors.brand.pink];
  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }} accessible accessibilityRole="image" accessibilityLabel="Nova">
      <LinearGradient colors={ring} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={[styles.inner, { width: size - 3, height: size - 3, borderRadius: (size - 3) / 2, backgroundColor: colors.background.primary }]}>
          <StarMark size={Math.round(size * 0.62)} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', justifyContent: 'center' },
});
