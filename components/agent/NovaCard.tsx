import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CaretRight } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { NovaAvatar } from '@/components/agent/NovaAvatar';

/**
 * The way into Ask Nova on a trip: Nova's face, a title and a hint, on a quiet card. It replaced a
 * purple→pink gradient button with a sparkle icon, which read as a generic AI switch (owner, 2026-10-17).
 */
export function NovaCard({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const press = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);
  return (
    <TouchableOpacity
      onPress={press}
      activeOpacity={0.75}
      style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
      accessibilityRole="button"
      accessibilityLabel="Ask Nova"
      accessibilityHint="Reorder days, find places and fix your plan"
    >
      <NovaAvatar size={36} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Ask Nova</Text>
        <Text style={[styles.hint, { color: colors.text.secondary }]} numberOfLines={1}>Reorder days, find places, fix your plan</Text>
      </View>
      <CaretRight size={18} color={colors.text.tertiary} weight="bold" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, minHeight: 60 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  hint: { fontSize: 13, lineHeight: 18 },
});
