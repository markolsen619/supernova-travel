import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { UsersThree, X, Check } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMutualFriends } from '@/hooks/useMutualFriends';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useCreateDmThread } from '@/hooks/useDmThreads';
import { Avatar } from '@/components/ui/Avatar';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.6;

interface FriendPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

export function FriendPickerSheet({ visible, onClose, onCreated }: FriendPickerSheetProps) {
  const { colors } = useTheme();
  const ownUid = useAuthStore((s) => s.user?.uid ?? '');
  const { data: friendUids = [] } = useMutualFriends(visible ? ownUid : null);
  const { data: profiles = {} } = useAuthorProfiles(friendUids);
  const createThread = useCreateDmThread();
  const [selected, setSelected] = useState<string[]>([]);

  const rows = useMemo(
    () =>
      friendUids
        .map((uid) => ({ uid, name: profiles[uid]?.name ?? 'Traveler', avatarUrl: profiles[uid]?.avatarUrl ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [friendUids, profiles],
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected([]);
    onClose();
  }, [onClose]);

  const toggleUid = useCallback((uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  }, []);

  const handleStart = useCallback(() => {
    if (selected.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createThread.mutate(selected, {
      onSuccess: (result) => {
        setSelected([]);
        onCreated(result.threadId);
      },
    });
  }, [selected, createThread, onCreated]);

  const sheetContent = (
    <View style={styles.content}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.brand.purple }]}>NEW MESSAGE</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {selected.length > 1 ? 'Start a group' : 'Message a friend'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
          <X size={20} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <UsersThree size={22} color={colors.text.disabled} weight="duotone" />
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            You can message mutual friends — people who follow you and you follow back.
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.uid);
            return (
              <TouchableOpacity
                style={[styles.row, { borderColor: colors.background.cardBorder }]}
                onPress={() => toggleUid(item.uid)}
                accessibilityLabel={`${isSelected ? 'Remove' : 'Add'} ${item.name}`}
              >
                <Avatar uri={item.avatarUrl} name={item.name} size="sm" />
                <Text style={[styles.rowText, { color: colors.text.primary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {isSelected && (
                  <View style={[styles.checkCircle, { backgroundColor: colors.brand.purple }]}>
                    <Check size={12} color="#ffffff" weight="bold" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selected.length > 0 && (
        <TouchableOpacity
          onPress={handleStart}
          disabled={createThread.isPending}
          style={[styles.startBtn, { backgroundColor: colors.text.primary }]}
        >
          <Text style={[styles.startBtnText, { color: colors.background.primary }]}>
            {selected.length === 1 ? 'Message' : `Start group (${selected.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheetWrap}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={90} tint="dark" style={styles.fill}>
              {sheetContent}
            </BlurView>
          ) : (
            <View style={[styles.fill, styles.androidBg]}>{sheetContent}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: {
    height: SHEET_HEIGHT,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  androidBg: { backgroundColor: 'rgba(10,10,26,0.97)' },
  content: { flex: 1, padding: Spacing['5'], gap: Spacing['3'] },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { gap: 2 },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold },
  emptyRow: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing['3'], paddingHorizontal: Spacing['6'] },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center' },
  listContent: { paddingBottom: Spacing['4'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingVertical: Spacing['3'], borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  startBtn: { paddingVertical: Spacing['4'], borderRadius: BorderRadius.full, alignItems: 'center' },
  startBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
