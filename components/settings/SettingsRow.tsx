import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CaretRight } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import type { PhosphorIcon } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface SettingsRowProps {
  label: string;
  /** Right-aligned value text (for informational rows). */
  value?: string;
  /** Optional leading Phosphor icon. */
  icon?: PhosphorIcon;
  /** Tapping navigates/acts; also renders the chevron unless `value` is set. */
  onPress?: () => void;
  /** Custom right-side content (e.g. a segmented control) — overrides value/chevron. */
  accessory?: React.ReactNode;
  /** Drawn under the row for every row except a section's last. */
  showDivider?: boolean;
}

/**
 * One settings row. Sections are plain Views of rows inside the shared card
 * chrome (see settings/index.tsx) — adding a future setting is one array
 * entry, not new layout code.
 */
export function SettingsRow({ label, value, icon: Icon, onPress, accessory, showDivider }: SettingsRowProps) {
  const { colors } = useTheme();

  const content = (
    <>
      <View style={styles.labelSide}>
        {Icon ? <Icon size={18} color={colors.text.secondary} weight="duotone" /> : null}
        <Text style={[styles.label, { color: colors.text.primary }]}>{label}</Text>
      </View>
      {accessory ?? (
        <View style={styles.valueSide}>
          {value ? (
            <Text style={[styles.value, { color: colors.text.secondary }]} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {onPress && !value ? (
            <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
          ) : null}
        </View>
      )}
    </>
  );

  const rowStyle = [
    styles.row,
    showDivider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.background.cardBorder },
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={rowStyle}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        activeOpacity={0.7}
        accessibilityLabel={label}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={rowStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    minHeight: 52,
    gap: Spacing['3'],
  },
  labelSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    flexShrink: 1,
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  valueSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    flexShrink: 1,
  },
  value: {
    fontSize: FontSize.base,
    textAlign: 'right',
  },
});
