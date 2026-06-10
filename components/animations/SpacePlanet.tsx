import React, { useEffect, useRef } from 'react';
import { View, ViewStyle, Animated } from 'react-native';
import Svg, { Circle, Ellipse, Path, Defs, RadialGradient, Stop, G } from 'react-native-svg';

interface SpacePlanetProps {
  size?: number;
  style?: ViewStyle;
}

export function SpacePlanet({ size = 220, style }: SpacePlanetProps) {
  const glowOpacity = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.2, duration: 3000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  const pr = size * 0.38;

  const shadowPath = `
    M ${cx} ${cy - pr}
    A ${pr} ${pr} 0 0 1 ${cx} ${cy + pr}
    A ${pr * 0.4} ${pr} 0 0 0 ${cx} ${cy - pr}
    Z
  `;

  const glowRingSize = (pr + 10) * 2;
  const glowRingRadius = pr + 10;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="planetBody" cx="35%" cy="30%" r="65%">
            <Stop offset="0%" stopColor="#5b2d9e" />
            <Stop offset="40%" stopColor="#2d1060" />
            <Stop offset="100%" stopColor="#090518" />
          </RadialGradient>
          <RadialGradient id="specular" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="white" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="white" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Circle cx={cx} cy={cy} r={pr} fill="url(#planetBody)" />
        <Ellipse cx={cx} cy={cy - pr * 0.15} rx={pr * 0.92} ry={pr * 0.13} fill="rgba(167,139,250,0.1)" />
        <Ellipse cx={cx} cy={cy + pr * 0.25} rx={pr * 0.85} ry={pr * 0.09} fill="rgba(96,165,250,0.07)" />
        <Path d={shadowPath} fill="rgba(0,0,0,0.42)" />
        <G rotation="-20" origin={`${cx}, ${cy}`}>
          <Ellipse
            cx={cx}
            cy={cy}
            rx={pr * 1.3}
            ry={pr * 0.28}
            fill="none"
            stroke="rgba(167,139,250,0.35)"
            strokeWidth={1.2}
          />
        </G>
        <Ellipse
          cx={cx - pr * 0.22}
          cy={cy - pr * 0.28}
          rx={pr * 0.22}
          ry={pr * 0.14}
          fill="url(#specular)"
        />
      </Svg>

      {/* Atmosphere glow ring — plain Animated.View, no SVG animation */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: cx - glowRingRadius,
          top: cy - glowRingRadius,
          width: glowRingSize,
          height: glowRingSize,
          borderRadius: glowRingRadius,
          borderWidth: 8,
          borderColor: '#a78bfa',
          opacity: glowOpacity,
        }}
      />
    </View>
  );
}
