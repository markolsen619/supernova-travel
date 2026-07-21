import React, { useCallback } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { CalendarBlank, X } from 'phosphor-react-native';
import type { ThemeColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { TripDay } from '@/types';

interface DayPickerSheetProps {
  visible: boolean;
  days: TripDay[];
  onSelect: (dayId: string) => void;
  onClose: () => void;
  colors: ThemeColors;
}

function formatDayLabel(day: TripDay): string {
  const base = `Day ${day.dayNumber}`;
  if (!day.date) return day.title ? `${base} · ${day.title}` : base;
  const formatted = day.date.toDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return day.title ? `${base} · ${formatted} · ${day.title}` : `${base} · ${formatted}`;
}

/**
 * "Which day?" picker for adding a map-tapped POI to a multi-day trip — the
 * trip map shows every day at once, unlike AddStopSheet (launched from one
 * day's own "Find a place" button, so the day is already known). Same row
 * pattern as AddToTripSheet's trip picker, one level down: days, not trips.
 */
export function DayPickerSheet({ visible, days, onSelect, onClose, colors }: DayPickerSheetProps) {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  const handleSelect = useCallback(
    (dayId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(dayId);
    },
    [onSelect],
  );

  const renderRow = useCallback(
    ({ item }: { item: TripDay }) => (
      <TouchableOpacity
        style={[styles.row, { borderColor: colors.background.cardBorder }]}
        onPress={() => handleSelect(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconBubble, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
          <CalendarBlank size={18} color={colors.brand.purple} weight="duotone" />
        </View>
        <Text style={[styles.rowText, { color: colors.text.primary }]} numberOfLines={1}>
          {formatDayLabel(item)}
        </Text>
      </TouchableOpacity>
    ),
    [colors, handleSelect],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheetWrap}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={90} tint="dark" style={styles.fill}>
              <SheetBody onClose={onClose} colors={colors}>
                <FlashList data={sorted} renderItem={renderRow} keyExtractor={(d) => d.id} contentContainerStyle={styles.listContent} />
              </SheetBody>
            </BlurView>
          ) : (
            <View style={[styles.fill, styles.androidBg]}>
              <SheetBody onClose={onClose} colors={colors}>
                <FlashList data={sorted} renderItem={renderRow} keyExtractor={(d) => d.id} contentContainerStyle={styles.listContent} />
              </SheetBody>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SheetBody({ children, onClose, colors }: { children: React.ReactNode; onClose: () => void; colors: ThemeColors }) {
  return (
    <View style={styles.body}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Add to which day?</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <X size={20} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: {
    maxHeight: '60%',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  androidBg: { backgroundColor: 'rgba(10,10,26,0.97)' },
  body: { padding: Spacing['5'], gap: Spacing['4'], minHeight: 180 },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  listContent: { paddingTop: Spacing['1'], paddingBottom: Spacing['4'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing['3'],
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
