import React, { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, ViewStyle, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useLayout } from '@/hooks/useLayout';

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (1664525 * s + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

interface StarData {
  cx: number;
  cy: number;
  r: number;
  staticOpacity: number;
}

interface TwinkleData extends StarData {
  duration: number;
  delay: number;
}

function generateStars(count: number, width: number, height: number): { static: StarData[]; twinkling: TwinkleData[] } {
  const rand = lcg(0xdeadbeef);
  const all = Array.from({ length: count }, (_, i) => {
    const rn = rand();
    const r = rn < 0.7 ? 0.8 + rand() * 0.4 : rn < 0.9 ? 1.5 + rand() * 0.5 : 2.5 + rand() * 1.0;
    const staticOpacity = r < 1.5 ? 0.15 + rand() * 0.2 : r < 2.0 ? 0.3 + rand() * 0.3 : 0.5 + rand() * 0.3;
    return {
      cx: rand() * width,
      cy: rand() * height,
      r,
      staticOpacity,
      duration: 1800 + rand() * 2400,
      delay: (i * 237) % 3000,
    };
  });

  const sorted = [...all].sort((a, b) => b.staticOpacity - a.staticOpacity);
  return {
    twinkling: sorted.slice(0, 20) as TwinkleData[],
    static: sorted.slice(20),
  };
}

function TwinkleStar({ star }: { star: TwinkleData }) {
  const opacity = useRef(new Animated.Value(star.staticOpacity * 0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: star.staticOpacity,
          duration: star.duration,
          delay: star.delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: star.staticOpacity * 0.2,
          duration: star.duration,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const diameter = star.r * 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: star.cx - star.r,
        top: star.cy - star.r,
        width: diameter,
        height: diameter,
        borderRadius: star.r,
        backgroundColor: 'white',
        opacity,
      }}
    />
  );
}

interface StarFieldProps {
  starCount?: number;
  opacity?: number;
  animated?: boolean;
  style?: ViewStyle;
}

export function StarField({ starCount = 80, opacity = 1, animated = true, style }: StarFieldProps) {
  const { width, height } = useLayout();

  const STAR_POOL = useMemo(() => generateStars(80, width, height), [width, height]);

  const maxTwinkling = Math.round((starCount / 80) * 20);
  const twinklingStars = STAR_POOL.twinkling.slice(0, maxTwinkling);
  const staticStars = STAR_POOL.static.slice(0, Math.max(0, starCount - maxTwinkling));

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg
        width={width}
        height={height}
        style={[StyleSheet.absoluteFill, { opacity }]}
        pointerEvents="none"
      >
        {staticStars.map((star, i) => (
          <Circle key={i} cx={star.cx} cy={star.cy} r={star.r} fill="white" opacity={star.staticOpacity} />
        ))}
        {!animated &&
          twinklingStars.map((star, i) => (
            <Circle key={`t${i}`} cx={star.cx} cy={star.cy} r={star.r} fill="white" opacity={star.staticOpacity * 0.5} />
          ))}
      </Svg>

      {animated &&
        twinklingStars.map((star, i) => (
          <TwinkleStar key={`tw_${i}`} star={star} />
        ))}
    </View>
  );
}
