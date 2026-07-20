import { Image, ImageStyle, StyleProp } from 'react-native';

interface StarMarkProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

// The single source of truth for the brand star mark. Every screen that
// shows the star imports this instead of require()-ing the PNG ad hoc,
// so size/treatment stays consistent app-wide.
export function StarMark({ size = 28, style }: StarMarkProps) {
  return (
    <Image
      source={require('@/assets/images/SupernovaStar.png')}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Supernova"
    />
  );
}
