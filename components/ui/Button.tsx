import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const sizeStyles: Record<Size, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: Spacing['2'], paddingHorizontal: Spacing['4'], fontSize: FontSize.sm },
  md: { paddingVertical: Spacing['3'], paddingHorizontal: Spacing['6'], fontSize: FontSize.base },
  lg: { paddingVertical: Spacing['4'], paddingHorizontal: Spacing['8'], fontSize: FontSize.md },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
}: ButtonProps) {
  const sz = sizeStyles[size];
  const isDisabled = disabled || loading;

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        style={[styles.wrapper, fullWidth && styles.fullWidth, style]}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={Colors.gradient.purplePink}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.base,
            { paddingVertical: sz.paddingVertical, paddingHorizontal: sz.paddingHorizontal },
            isDisabled && styles.disabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <Text style={[styles.primaryText, { fontSize: sz.fontSize }, textStyle]}>{label}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyle = variant === 'secondary'
    ? styles.secondary
    : variant === 'ghost'
    ? styles.ghost
    : styles.danger;

  const variantTextStyle = variant === 'secondary'
    ? styles.secondaryText
    : variant === 'ghost'
    ? styles.ghostText
    : styles.dangerText;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.base,
        variantStyle,
        { paddingVertical: sz.paddingVertical, paddingHorizontal: sz.paddingHorizontal },
        isDisabled && styles.disabled,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.brand.purple} size="small" />
      ) : (
        <Text style={[{ fontSize: sz.fontSize }, variantTextStyle, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'flex-start' },
  fullWidth: { width: '100%' },
  base: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondary: {
    borderWidth: 1,
    borderColor: Colors.brand.purple,
    backgroundColor: 'rgba(167,139,250,0.1)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: Colors.semantic.error,
  },
  disabled: { opacity: 0.5 },
  primaryText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  secondaryText: {
    color: Colors.brand.purple,
    fontWeight: FontWeight.semiBold,
  },
  ghostText: {
    color: Colors.text.secondary,
    fontWeight: FontWeight.medium,
  },
  dangerText: {
    color: Colors.semantic.error,
    fontWeight: FontWeight.semiBold,
  },
});
