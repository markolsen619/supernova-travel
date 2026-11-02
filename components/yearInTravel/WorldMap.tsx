/**
 * Year in Travel's map: a dot-matrix world (assets/yearInTravel/worldDots.json) with the year's cities glowing in
 * the star gradient and arcs between them, drawn in unless Reduce Motion is on. Always dark.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop, G } from 'react-native-svg';
import { arcPath, project, worldDots } from '@/utils/yearMap';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const DOTS = worldDots();

export const WorldMap = memo(function WorldMap({ width, places, animate }: {
  width: number; places: { name: string; lat: number; lng: number }[]; animate: boolean;
}) {
  const height = Math.round(width * (145 / 360));
  const draw = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.timing(draw, { toValue: 1, duration: 1800, delay: 300, useNativeDriver: false }).start();
  }, [animate, draw]);
  const arcs = useMemo(() => places.slice(1).map((p, i) => arcPath(places[i], p, width, height)), [places, width, height]);
  const pts = useMemo(() => places.map((p) => project(p.lat, p.lng, width, height)), [places, width, height]);
  const dash = 2000;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="arc" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#7F77DD" />
          <Stop offset="1" stopColor="#D4537E" />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#E28FA9" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#7F77DD" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <G>
        {DOTS.map(([lat, lng], i) => {
          const p = project(lat, lng, width, height);
          return <Circle key={i} cx={p.x} cy={p.y} r={width / 300} fill="#F5F3F9" fillOpacity={0.16} />;
        })}
      </G>
      {arcs.map((d, i) => (
        <AnimatedPath
          key={`a${i}`} d={d} stroke="url(#arc)" strokeWidth={1.6} fill="none" strokeLinecap="round"
          strokeDasharray={`${dash}`}
          strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [dash, 0] })}
        />
      ))}
      {pts.map((p, i) => (
        <G key={`p${i}`}>
          <Circle cx={p.x} cy={p.y} r={width / 45} fill="url(#glow)" />
          <Circle cx={p.x} cy={p.y} r={width / 160} fill="#FFFFFF" />
        </G>
      ))}
    </Svg>
  );
});
