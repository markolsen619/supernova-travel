import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { ArrowDown, ArrowUp, DotsSixVertical, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { moveItem } from '@/utils/reorder';
import type { TripActivity } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface ReorderStopsSheetProps {
  visible: boolean;
  dayLabel: string;
  stops: TripActivity[];
  onClose: () => void;
  onSave: (ordered: TripActivity[]) => void;
}

/**
 * Reorder a day's stops (opened by long-pressing a stop). A full screen of its
 * own, not a sheet: dragging stops inside the trip page's scroll — a draggable
 * list nested in a scroll view, inside a swipe-to-close sheet — lifted the stop
 * to the top and wouldn't let it move. Here the list is the screen's only
 * scroll, and every stop also has up / down arrows.
 */
export function ReorderStopsSheet({ visible, dayLabel, stops, onClose, onSave }: ReorderStopsSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<TripActivity[]>(stops);
  const wasVisible = useRef(false);

  // The day's order as it is when the screen opens (not while you edit — the trip refetches in the background).
  useEffect(() => {
    if (visible && !wasVisible.current) setItems(stops);
    wasVisible.current = visible;
  }, [visible, stops]);

  const move = useCallback((i: number, by: -1 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((cur) => moveItem(cur, i, by));
  }, []);

  const save = useCallback(() => {
    onSave(items);
    onClose();
  }, [items, onSave, onClose]);

  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<TripActivity>) => {
    const i = getIndex() ?? 0;
    const { Icon, color } = ACTIVITY_ICONS[item.type];
    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); drag(); }}
          delayLongPress={200}
          disabled={isActive}
          activeOpacity={0.9}
          style={[styles.row, { backgroundColor: colors.background.card, borderColor: isActive ? colors.text.primary : colors.background.cardBorder }]}
          accessibilityLabel={`${item.title}. Hold and drag to move, or use the arrows.`}
        >
          <DotsSixVertical size={20} color={colors.text.tertiary} weight="bold" />
          <Icon size={18} color={color} weight="duotone" />
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>{item.title}</Text>
          <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} style={styles.arrow} accessibilityLabel={`Move ${item.title} up`}>
            <ArrowUp size={16} color={i === 0 ? colors.text.disabled : colors.text.primary} weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(i, 1)} disabled={i === items.length - 1} style={styles.arrow} accessibilityLabel={`Move ${item.title} down`}>
            <ArrowDown size={16} color={i === items.length - 1 ? colors.text.disabled : colors.text.primary} weight="bold" />
          </TouchableOpacity>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [colors, items.length, move]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing['3'] }]}>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{dayLabel.toUpperCase()}</Text>
            <Text style={[styles.heading, { color: colors.text.primary }]}>Reorder stops</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without saving">
            <X size={22} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.text.secondary }]}>Hold a stop and drag it, or use the arrows.</Text>
        <DraggableFlatList
          data={items}
          keyExtractor={(a) => a.id}
          renderItem={renderItem}
          onDragBegin={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          onDragEnd={({ data }) => setItems(data)}
          containerStyle={styles.list}
          contentContainerStyle={styles.listContent}
        />
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing['4'], borderColor: colors.background.cardBorder }]}>
          <Button label="Save order" onPress={save} haptic="medium" />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing['5'], gap: Spacing['3'] },
  headerText: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  heading: { fontSize: 28, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  hint: { fontSize: 15, paddingHorizontal: Spacing['5'], marginTop: Spacing['2'], marginBottom: Spacing['3'] },
  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing['5'], paddingBottom: Spacing['6'], gap: Spacing['2'] },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 60, paddingLeft: Spacing['3'],
    borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing['2'],
  },
  title: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.medium },
  arrow: { width: 44, height: 60, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['3'], borderTopWidth: StyleSheet.hairlineWidth },
});
