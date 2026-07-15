import React, { useCallback } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

// 'primary' is the near-black default CTA — the workhorse used on most
// screens. 'hero' is the brand gradient, reserved for at most one CTA per
// flow (see SKILL.md) — opt in explicitly, don't reach for it by default.
type Variant = 'primary' | 'hero' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type Haptic = 'light' | 'medium' | 'none';

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
  /** Optional Phosphor icon component (e.g. `Plus`, not `<Plus />`) — omit for a text-only button. */
  icon?: PhosphorIcon;
  /** Which side of the label the icon sits on. Defaults to 'left'. */
  iconPosition?: 'left' | 'right';
  /**
   * Haptic fired on press, before onPress. Defaults by variant (primary/hero/
   * danger → medium, secondary/ghost → light) so most call sites need nothing.
   * Pass 'none' if the screen already fires its own haptic in onPress (to
   * avoid a double-buzz), or an explicit level to override the default.
   */
  haptic?: Haptic;
  /**
   * Override the resolved theme palette — for the rare Button rendered on an
   * always-dark immersive screen (e.g. the welcome splash), where useTheme()
   * would otherwise follow the user's light/dark app setting instead of
   * staying pinned dark. Omit for every normal, theme-reactive call site.
   */
  colors?: ThemeColors;
}

// Accessibility floor is 44×44pt (SKILL.md). 'md'/'lg' get there (or already
// clear it) via an explicit minHeight — a floor, not a target, so it doesn't
// change their organic padding-driven size. 'sm' deliberately stays visually
// compact (it exists specifically for dense rows — a follow button next to a
// name, "Find a place" next to a text link) and instead gets its touch target
// expanded via hitSlop below, per the standard compact-but-tappable pattern.
const sizeStyles: Record<Size, { paddingVertical: number; paddingHorizontal: number; fontSize: number; iconSize: number; minHeight?: number }> = {
  sm: { paddingVertical: Spacing['2'], paddingHorizontal: Spacing['4'], fontSize: FontSize.sm, iconSize: 14 },
  md: { paddingVertical: Spacing['3'], paddingHorizontal: Spacing['6'], fontSize: FontSize.base, iconSize: 16, minHeight: 44 },
  lg: { paddingVertical: Spacing['4'], paddingHorizontal: Spacing['8'], fontSize: FontSize.md, iconSize: 18, minHeight: 44 },
};

// sm's organic height (13px text + 8px vertical padding each side) lands
// around 32-34pt depending on platform font metrics — this pads the tappable
// region up to the 44pt floor without inflating the rendered box.
const smHitSlop = { top: 10, bottom: 10, left: 6, right: 6 };

const defaultHapticByVariant: Record<Variant, Haptic> = {
  primary: 'medium',
  hero: 'medium',
  secondary: 'light',
  ghost: 'light',
  danger: 'medium',
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
  icon: Icon,
  iconPosition = 'left',
  haptic,
  colors: colorsOverride,
}: ButtonProps) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const sz = sizeStyles[size];
  const isDisabled = disabled || loading;

  const handlePress = useCallback(() => {
    const level = haptic ?? defaultHapticByVariant[variant];
    if (level === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (level === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  }, [haptic, variant, onPress]);

  // Color-dependent values must be inline (Architecture Rule 4) — StyleSheet.create
  // below holds only static layout.
  const variantColors: Record<Exclude<Variant, 'hero'>, { bg: string; border?: string; text: string }> = {
    primary: { bg: colors.action.primary, text: colors.action.primaryText },
    secondary: { bg: colors.background.card, border: colors.background.cardBorder, text: colors.text.primary },
    ghost: { bg: 'transparent', text: colors.text.secondary },
    danger: { bg: colors.background.card, border: colors.semantic.error, text: colors.semantic.error },
  };

  const iconColorByVariant: Record<Variant, string> = {
    primary: colors.action.primaryText,
    hero: colors.white,
    secondary: colors.text.primary,
    ghost: colors.text.secondary,
    danger: colors.semantic.error,
  };

  const iconEl = Icon ? (
    <Icon size={sz.iconSize} color={iconColorByVariant[variant]} weight="bold" />
  ) : null;

  if (variant === 'hero') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={isDisabled}
        hitSlop={size === 'sm' ? smHitSlop : undefined}
        style={[styles.wrapper, fullWidth && styles.fullWidth, style]}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={colors.gradient.purplePink}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.base,
            {
              paddingVertical: sz.paddingVertical,
              paddingHorizontal: sz.paddingHorizontal,
              gap: Spacing['2'],
              minHeight: sz.minHeight,
            },
            isDisabled && styles.disabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              {iconPosition === 'left' && iconEl}
              <Text style={[styles.heroText, { fontSize: sz.fontSize, color: colors.white }, textStyle]}>{label}</Text>
              {iconPosition === 'right' && iconEl}
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const v = variantColors[variant];

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.7}
      hitSlop={size === 'sm' ? smHitSlop : undefined}
      style={[
        styles.base,
        {
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          paddingVertical: sz.paddingVertical,
          paddingHorizontal: sz.paddingHorizontal,
          gap: Spacing['2'],
          minHeight: sz.minHeight,
        },
        isDisabled && styles.disabled,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <>
          {iconPosition === 'left' && iconEl}
          <Text style={[styles.text, { fontSize: sz.fontSize, color: v.text }, textStyle]}>{label}</Text>
          {iconPosition === 'right' && iconEl}
        </>
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
  disabled: { opacity: 0.5 },
  heroText: {
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  text: {
    fontWeight: FontWeight.semiBold,
  },
});
