import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretRight, EnvelopeSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useProGate } from '@/hooks/useProGate';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

/** The wallet's way into Email import. Pro; free users see the PRO tag and the paywall. */
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
      <View style={[styles.bubble, { backgroundColor: colors.background.sunken }]}>
        <EnvelopeSimple size={20} color={colors.text.primary} weight="duotone" />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Email import</Text>
        <Text style={[styles.subtitle, { color: colors.text.tertiary }]} numberOfLines={1}>Forward bookings to your own address</Text>
      </View>
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
    flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 64, marginHorizontal: Spacing['5'],
    marginBottom: Spacing['3'], paddingHorizontal: Spacing['4'], borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth,
  },
  bubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  subtitle: { fontSize: 13 },
  tag: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing['2'], paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: FontWeight.semiBold, letterSpacing: 0.9 },
});
