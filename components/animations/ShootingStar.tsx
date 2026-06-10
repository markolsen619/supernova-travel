import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const TRAVEL = 600;

interface ShootingStarProps {
  startX: number;
  startY: number;
  angle: number;
  length: number;
  duration: number;
  onComplete: () => void;
}

export function ShootingStar({ startX, startY, angle, length, duration, onComplete }: ShootingStarProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(progress, {
        toValue: TRAVEL,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(duration * 0.6),
        Animated.timing(opacity, {
          toValue: 0,
          duration: duration * 0.4,
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onComplete();
    });

    return () => {
      progress.stopAnimation();
      opacity.stopAnimation();
    };
  }, []);

  const translateX = progress.interpolate({ inputRange: [0, TRAVEL], outputRange: [0, dx * TRAVEL] });
  const translateY = progress.interpolate({ inputRange: [0, TRAVEL], outputRange: [0, dy * TRAVEL] });

  const svgW = length + 20;
  const svgH = length + 20;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { opacity, transform: [{ translateX }, { translateY }] },
      ]}
    >
      <Svg
        width={svgW}
        height={svgH}
        style={{ position: 'absolute', left: startX - 10, top: startY - 10 }}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={`tail_${startX}`} x1="1" y1="0" x2="0" y2="0">
            <Stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <Stop offset="100%" stopColor="white" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Line
          x1={10 + dx * length}
          y1={10 + dy * length}
          x2={10}
          y2={10}
          stroke={`url(#tail_${startX})`}
          strokeWidth={1.5}
        />
        <Circle cx={10 + dx * length} cy={10 + dy * length} r={2.5} fill="white" opacity={0.95} />
      </Svg>
    </Animated.View>
  );
}
