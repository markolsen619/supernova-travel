import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  bordered?: boolean;
}

export function GlassCard({ children, style, intensity = 20, bordered = true }: GlassCardProps) {
  return (
    <View style={[styles.container, bordered && styles.border, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.background.card,
  },
  border: {
    borderWidth: 1,
    borderColor: Colors.background.cardBorder,
  },
  content: {
    flex: 1,
  },
});
