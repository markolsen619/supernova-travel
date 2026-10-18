import React, { useCallback, useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretRight, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/ui/Avatar';
import { memberRows, type MemberRow } from '@/utils/tripMembers';

/** "People on this trip": opened by tapping the member pictures on a shared trip (owner, 2026-10-17). */
export function TripMembersSheet({ visible, onClose, authorUid, collaborators, profiles }: {
  visible: boolean; onClose: () => void; authorUid: string; collaborators: string[];
  profiles: Record<string, { name?: string; avatarUrl?: string | null } | undefined>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const rows = useMemo(() => memberRows(authorUid, collaborators, profiles), [authorUid, collaborators, profiles]);

  const open = useCallback((uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push(`/user/${uid}`);
  }, [onClose]);

  const renderItem = useCallback(({ item }: { item: MemberRow }) => (
    <TouchableOpacity onPress={() => open(item.uid)} style={styles.row} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.role}`}>
      <Avatar uri={item.avatarUrl} name={item.name} size="md" />
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.role, { color: colors.text.tertiary }]}>{item.role}</Text>
      </View>
      <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
    </TouchableOpacity>
  ), [colors, open]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.background.primary, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{`${rows.length} ON THIS TRIP`}</Text>
              <Text style={[styles.title, { color: colors.text.primary }]}>People on this trip</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color={colors.text.secondary} weight="bold" />
            </TouchableOpacity>
          </View>
          <View style={{ height: Math.min(rows.length, 6) * 64 }}>
            <FlashList data={rows} renderItem={renderItem} keyExtractor={(r) => r.uid} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '500' },
  role: { fontSize: 13 },
});
