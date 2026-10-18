import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretRight, EnvelopeSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useProGate } from '@/hooks/useProGate';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

/** The wallet's way into Email import: one slim line (it was a full card; owner, 2026-10-17). Pro; free users see the PRO tag and the paywall. */
export function EmailImportRow() {
  const { colors } = useTheme();
  const { isPro, openPaywall } = useProGate();
  const open = useCallback(() => {
    if (!isPro) {
      openPaywall();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(wallet)/email-import');
  }, [isPro, openPaywall]);

  return (
    <TouchableOpacity
      onPress={open}
      style={[styles.row, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
      accessibilityRole="button"
      accessibilityLabel={isPro ? 'Email import' : 'Email import, a Pro feature'}
    >
      <EnvelopeSimple size={18} color={colors.text.secondary} weight="duotone" />
      <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>Import bookings from email</Text>
      {!isPro && (
        <View style={[styles.tag, { backgroundColor: colors.background.sunken }]}>
          <Text style={[styles.tagText, { color: colors.text.secondary }]}>PRO</Text>
        </View>
      )}
      <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44, marginHorizontal: Spacing['5'],
    marginBottom: Spacing['3'], paddingHorizontal: Spacing['3'], borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  tag: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing['2'], paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: FontWeight.semiBold, letterSpacing: 0.9 },
});
