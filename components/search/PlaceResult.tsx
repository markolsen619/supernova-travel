import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface PlaceResultProps {
  mainText: string;
  secondaryText: string;
  placeId: string;
  onPress: (placeId: string, mainText: string) => void;
}

export function PlaceResult({ mainText, secondaryText, placeId, onPress }: PlaceResultProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={() => onPress(placeId, mainText)}
      activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}
    >
      <Text style={styles.pin}>📍</Text>

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
  pin: {
    fontSize: 20,
    flexShrink: 0,
  },
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
