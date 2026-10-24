import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkColors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Spacing } from '@/constants/spacing';
import { FontWeight } from '@/constants/typography';

/**
 * "Record video" — the trip video never starts without this tap (spec 2026-10-24-trip-video-design.md §1).
 * The trip map is an always-dark screen, so this sheet uses DarkColors (Architecture Rule 3).
 */
export function TripVideoSheet({ visible, tripTitle, error, busy, onRecord, onClose }: {
  visible: boolean; tripTitle: string; error: string | null; busy: boolean; onRecord: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const c = DarkColors;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.background.secondary, borderColor: c.background.cardBorder, paddingBottom: insets.bottom + Spacing['5'] }]}>
        <Text style={[styles.eyebrow, { color: c.text.tertiary }]}>TRIP VIDEO</Text>
        <Text style={[styles.title, { color: c.text.primary }]} numberOfLines={2}>{tripTitle}</Text>
        <Text style={[styles.body, { color: c.text.secondary }]}>About 25 seconds of your trip from above, ready for Reels, TikTok or Stories.</Text>
        {error ? <Text style={[styles.body, { color: c.semantic.error }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <Button label="Record video" onPress={onRecord} loading={busy} haptic="medium" fullWidth />
          <TouchableOpacity onPress={onClose} disabled={busy} style={styles.notNow} accessibilityRole="button">
            <Text style={[styles.notNowText, { color: c.text.secondary }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['6'], borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: Spacing['2'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: 24, fontWeight: FontWeight.semiBold, letterSpacing: -0.4 },
  body: { fontSize: 15, lineHeight: 22 },
  actions: { marginTop: Spacing['4'], gap: Spacing['1'] },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notNowText: { fontSize: 15, fontWeight: FontWeight.medium },
});
