import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface PlaceResultProps {
  mainText: string;
  secondaryText: string;
  placeId: string;
  onPress: (placeId: string, mainText: string) => void;
  /**
   * Unlike UserResult/TripResult (search.tsx-only), this component is also
   * used by AddStopSheet in a normal light-chrome context — so it can't just
   * be pinned to DarkColors. Callers that render it over the always-dark
   * globe (search.tsx) pass DarkColors explicitly; AddStopSheet omits this
   * and gets the normal theme-reactive palette.
   */
  colors?: ThemeColors;
}

export function PlaceResult({ mainText, secondaryText, placeId, onPress, colors: colorsOverride }: PlaceResultProps) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;

  return (
    <TouchableOpacity
      onPress={() => onPress(placeId, mainText)}
      activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}
    >
      <MapPin size={20} color={colors.brand.purple} weight="duotone" />

      <View style={styles.center}>
        <Text
          style={[styles.mainText, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {mainText}
        </Text>
        <Text
          style={[styles.secondaryText, { color: colors.text.tertiary }]}
          numberOfLines={1}
        >
          {secondaryText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing['3'],
  },
  // pin style removed — using Phosphor MapPin directly
  center: {
    flex: 1,
    gap: 2,
  },
  mainText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  secondaryText: {
    fontSize: FontSize.sm,
  },
});
