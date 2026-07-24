/**
 * app/trip/packing.tsx
 *
 * Categorized packing list — generated once from services/packingTemplates.ts
 * on first open (see usePackingList), editable/checkable by any collaborator
 * after that. Flat modal route + `id` param, same convention as trip/budget.tsx.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Backpack, Check, Plus, TrashSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTrip } from '@/hooks/useTrip';
import { usePackingList } from '@/hooks/usePackingList';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { PackingItem } from '@/types';

export default function PackingListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  const { data: trip, isLoading: tripLoading } = useTrip(id ?? null);
  const isOwner = !!trip && trip.authorUid === uid;
  const { items, isLoading: itemsLoading, addItem, toggleItem, deleteItem } = usePackingList(trip ?? undefined, isOwner, uid);

  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  const categories = useMemo(() => {
    const grouped = new Map<string, PackingItem[]>();
    for (const item of items) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }
    return Array.from(grouped.entries());
  }, [items]);

  const checkedCount = items.filter((i) => i.checked).length;

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleToggle = useCallback(
    (item: PackingItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleItem.mutate({ itemId: item.id, checked: !item.checked });
    },
    [toggleItem],
  );

  const handleDelete = useCallback(
    (itemId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteItem.mutate(itemId);
    },
    [deleteItem],
  );

  const startAdding = useCallback((category: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddingCategory(category);
    setDraftLabel('');
  }, []);

  const submitAdd = useCallback(
    (category: string) => {
      const label = draftLabel.trim();
      if (!label) { setAddingCategory(null); return; }
      addItem.mutate({ label, category, addedByUid: uid });
      setDraftLabel('');
      setAddingCategory(null);
    },
    [draftLabel, addItem, uid],
  );

  if (tripLoading || !trip) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
        <SkeletonBlock height={60} radius={BorderRadius.lg} style={{ margin: Spacing['5'] }} />
        <SkeletonBlock height={200} radius={BorderRadius.lg} style={{ marginHorizontal: Spacing['5'] }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} hitSlop={8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>PACKING LIST</Text>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]} numberOfLines={1}>{trip.title}</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      {items.length > 0 && (
        <Text style={[styles.progressText, { color: colors.text.secondary }]}>
          {checkedCount} of {items.length} packed
        </Text>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Spacing['5'], paddingBottom: insets.bottom + Spacing['8'] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {itemsLoading && items.length === 0 ? (
          <View style={{ gap: Spacing['3'] }}>
            <SkeletonBlock height={22} width={120} radius={4} />
            <SkeletonBlock height={44} radius={BorderRadius.md} />
            <SkeletonBlock height={44} radius={BorderRadius.md} />
          </View>
        ) : (
          categories.map(([category, categoryItems]) => (
            <View key={category} style={styles.section}>
              <Text style={[styles.categoryHeading, { color: colors.text.tertiary }]}>
                {category.toUpperCase()}
              </Text>
              {categoryItems.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <TouchableOpacity
                    style={styles.itemTapArea}
                    onPress={() => handleToggle(item)}
                    activeOpacity={0.7}
                    accessibilityLabel={item.checked ? `Mark ${item.label} unpacked` : `Mark ${item.label} packed`}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: item.checked ? colors.brand.purple : 'transparent',
                          borderColor: item.checked ? colors.brand.purple : colors.background.cardBorder,
                        },
                      ]}
                    >
                      {item.checked && <Check size={13} color="#ffffff" weight="bold" />}
                    </View>
                    <Text
                      style={[
                        styles.itemLabel,
                        { color: item.checked ? colors.text.tertiary : colors.text.primary },
                        item.checked && styles.itemLabelChecked,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                  {/* Persistent, visible delete — matches DayTimeline's
                      "Delete day" pattern rather than a hidden long-press. */}
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    hitSlop={12}
                    style={styles.itemDeleteBtn}
                    accessibilityLabel={`Delete ${item.label}`}
                  >
                    <TrashSimple size={15} color={colors.text.disabled} weight="regular" />
                  </TouchableOpacity>
                </View>
              ))}

              {addingCategory === category ? (
                <View style={[styles.addRow, { borderColor: colors.background.cardBorder }]}>
                  <TextInput
                    value={draftLabel}
                    onChangeText={setDraftLabel}
                    placeholder="Add an item"
                    placeholderTextColor={colors.text.tertiary}
                    autoFocus
                    style={[styles.addInput, { color: colors.text.primary }]}
                    onSubmitEditing={() => submitAdd(category)}
                    onBlur={() => submitAdd(category)}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addTrigger}
                  onPress={() => startAdding(category)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityLabel={`Add item to ${category}`}
                >
                  <Plus size={14} color={colors.brand.purple} weight="bold" />
                  <Text style={[styles.addTriggerText, { color: colors.brand.purple }]}>Add item</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {!itemsLoading && categories.length === 0 && (
          <View style={styles.emptyWrap}>
            <Backpack size={28} color={colors.text.disabled} weight="duotone" />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Building your list…</Text>
            <Text style={[styles.emptyBody, { color: colors.text.tertiary }]}>
              This trip&apos;s packing list is being put together.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['2'],
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTextBlock: { flex: 1 },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
  },
  headerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, marginTop: 2 },
  progressText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    paddingHorizontal: Spacing['5'],
    marginBottom: Spacing['3'],
  },

  section: { marginBottom: Spacing['5'] },
  categoryHeading: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
    marginBottom: Spacing['2'],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  itemTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { fontSize: FontSize.sm, flex: 1 },
  itemLabelChecked: { textDecorationLine: 'line-through' },
  itemDeleteBtn: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },

  addRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['3'],
    marginTop: Spacing['1'],
  },
  addInput: {
    fontSize: FontSize.sm,
    paddingVertical: Spacing['3'],
  },
  addTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    paddingVertical: Spacing['2'],
    marginTop: Spacing['1'],
  },
  addTriggerText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  emptyWrap: {
    alignItems: 'center',
    gap: Spacing['2'],
    paddingTop: Spacing['16'],
    paddingHorizontal: Spacing['8'],
  },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  emptyBody: { fontSize: FontSize.sm, textAlign: 'center' },
});
