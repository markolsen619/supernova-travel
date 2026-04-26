import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
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

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[{ width: px, height: px, borderRadius: px / 2 }, styles.image, style]}
      />
    );
  }

  return (
    <LinearGradient
      colors={Colors.gradient.purplePink}
      style={[{ width: px, height: px, borderRadius: px / 2 }, styles.gradient, style]}
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
  },
  initials: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },
});
