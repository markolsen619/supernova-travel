import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, ImageStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { FontWeight } from '@/constants/typography';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  style?: ViewStyle;
}

const sizePx: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 64,
  xl: 96,
};

const fontSizes: Record<AvatarSize, number> = {
  xs: 10,
  sm: 13,
  md: 18,
  lg: 26,
  xl: 38,
};

export function Avatar({ uri, name, size = 'md', style }: AvatarProps) {
  const px = sizePx[size];
  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const circleStyle: ImageStyle = {
    width: px,
    height: px,
    borderRadius: px / 2,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[circleStyle, styles.image, style as ImageStyle]}
      />
    );
  }

  return (
    <LinearGradient
      colors={Colors.gradient.purplePink}
      style={[circleStyle, styles.gradient, style]}
    >
      <Text style={[styles.initials, { fontSize: fontSizes[size] }]}>{initials}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  image: {
    borderWidth: 2,
    borderColor: Colors.brand.purple,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  initials: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },
});
