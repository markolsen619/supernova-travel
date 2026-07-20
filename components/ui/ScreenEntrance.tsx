import { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { SPRING, Duration } from '@/constants/motion';

// Standard mount entrance for top-level screens: content fades in and rises
// 12px on the house spring. One container-level animation — never stagger
// list items on the main tabs (perf).
export function ScreenEntrance({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: Duration.base, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, ...SPRING }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.fill, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
