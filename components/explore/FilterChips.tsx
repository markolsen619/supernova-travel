import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';

interface FilterChipsProps<T extends string> {
  items: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  /** Read by VoiceOver before the chips: "Region", "Vibe". */
  label: string;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    scale.setValue(0.92);
    Animated.spring(scale, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }).start();
  }, [active, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          styles.chip,
          active
            ? { backgroundColor: colors.text.primary }
            : { backgroundColor: colors.background.sunken },
        ]}
      >
        <Text style={[styles.chipText, { color: active ? colors.background.primary : colors.text.secondary }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function FilterChips<T extends string>({ items, selected, onSelect, label }: FilterChipsProps<T>) {
  const handle = useCallback((id: T) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(id);
  }, [onSelect]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={label}
    >
      {items.map((it) => (
        <Chip key={it.id} label={it.label} active={it.id === selected} onPress={() => handle(it.id)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing['6'], gap: Spacing['2'] },
  // 44pt tall: the touch-target floor, and a comfortable pill.
  chip: { minHeight: 44, paddingHorizontal: Spacing['4'], borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
