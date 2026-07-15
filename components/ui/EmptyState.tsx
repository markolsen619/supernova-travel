import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: PhosphorIcon;
  /**
   * Haptic for the primary action — defaults to Button's own default
   * ('medium', correct for actions that create/write immediately, e.g. "Add
   * a day"). Pass 'light' when the action only opens a sheet/form rather
   * than writing data itself (e.g. "Find a place" opens AddStopSheet).
   */
  actionHaptic?: 'light' | 'medium' | 'none';
  /** A tertiary text-link shown below the primary action (e.g. "Add manually"
   * next to "Find a place") — optional, most empty states need only one action.
   * Always fires a Light haptic (it opens something; it doesn't write data). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** 'sm' for empty states nested inside a section (e.g. one day's stop
   * list); 'md' for a full screen/tab's empty state. */
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

/** icon + title + description + action — the shape SKILL.md requires for
 * every empty state. Built from the trip screen's own hand-rolled empty
 * states; other screens should reach for this instead of re-hand-rolling. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  actionHaptic,
  secondaryLabel,
  onSecondary,
  size = 'md',
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const isSmall = size === 'sm';

  const handleSecondary = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSecondary?.();
  }, [onSecondary]);

  return (
    <View style={[styles.container, isSmall ? styles.containerSm : styles.containerMd, style]}>
      <Icon size={isSmall ? 26 : 32} color={colors.text.disabled} weight="duotone" />
      <Text style={[styles.title, { color: colors.text.primary }, isSmall && styles.titleSm]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.text.secondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          onPress={onAction}
          icon={actionIcon}
          variant="primary"
          size={isSmall ? 'sm' : 'md'}
          haptic={actionHaptic}
          style={styles.action}
        />
      )}
      {secondaryLabel && onSecondary && (
        <TouchableOpacity onPress={handleSecondary} hitSlop={8} style={styles.secondaryBtn}>
          <Text style={[styles.secondaryText, { color: colors.text.secondary }]}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing['1'],
  },
  containerMd: {
    paddingVertical: Spacing['10'],
    paddingHorizontal: Spacing['6'],
  },
  containerSm: {
    paddingVertical: Spacing['8'],
    paddingHorizontal: Spacing['4'],
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    textAlign: 'center',
    marginTop: Spacing['3'],
  },
  titleSm: {
    fontSize: FontSize.base,
  },
  description: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing['4'],
  },
  action: {
    marginTop: Spacing['1'],
  },
  secondaryBtn: {
    paddingVertical: Spacing['2'],
  },
  secondaryText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textDecorationLine: 'underline',
  },
});
