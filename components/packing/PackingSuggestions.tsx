import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Plus, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import type { Suggestion } from '@/utils/packingSuggestions';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

/** "Suggested for this trip" (spec 2026-11-12): forecast, season, stops, plugs, length — + adds, ✕ dismisses. */
export const PackingSuggestions = memo(function PackingSuggestions({ suggestions, onAdd, onDismiss }: {
  suggestions: Suggestion[]; onAdd: (s: Suggestion) => void; onDismiss: (s: Suggestion) => void;
}) {
  const { colors } = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.text.tertiary }]}>SUGGESTED FOR THIS TRIP</Text>
      <View style={[styles.card, { backgroundColor: colors.background.card }]}>
        {suggestions.map((s) => (
          <View key={s.label} style={styles.row}>
            <View style={styles.text}>
              <Text style={[styles.label, { color: colors.text.primary }]}>{s.label}</Text>
              <Text style={[styles.reason, { color: colors.text.tertiary }]}>{s.reason}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onAdd(s); }}
              style={styles.btn}
              accessibilityRole="button"
              accessibilityLabel={`Add ${s.label}`}
            >
              <Plus size={16} color={colors.text.primary} weight="bold" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismiss(s); }}
              style={styles.btn}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${s.label}`}
            >
              <X size={14} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: Spacing['6'], gap: Spacing['2'] },
  heading: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  card: { borderRadius: BorderRadius.lg, paddingLeft: Spacing['4'], paddingVertical: Spacing['1'] },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  text: { flex: 1, paddingVertical: Spacing['2'] },
  label: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  reason: { fontSize: FontSize.sm, marginTop: 2 },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
