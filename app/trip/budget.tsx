/**
 * app/trip/budget.tsx
 *
 * Shared trip budget — a ledger, not a payment rail (see Expense doc
 * comment). Flat modal route taking `id` as a param, same convention as
 * trip/new.tsx and trip/ai-generate.tsx (trip/[id].tsx isn't a layout
 * group, so sub-features live as siblings, not nested routes).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Wallet, Plus, PencilSimple, ArrowRight, TrashSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTrip } from '@/hooks/useTrip';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { useExpenses, useExpenseMutations, computeBalances } from '@/hooks/useTripBudget';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { AddExpenseSheet, type ExpenseFormData } from '@/components/trip/AddExpenseSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { EXPENSE_ICONS } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { Expense } from '@/types';

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export default function BudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const currentUid = useAuthStore((s) => s.user?.uid ?? '');

  const { data: trip, isLoading: tripLoading } = useTrip(id ?? null);
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses(id ?? null);
  const { addExpense, deleteExpense } = useExpenseMutations(id ?? '');
  const { updateTrip } = useCreateTrip();

  const memberUids = useMemo(() => (trip ? [trip.authorUid, ...trip.collaborators] : []), [trip]);
  const { data: profiles = {} } = useAuthorProfiles(memberUids);
  const members = useMemo(
    () => memberUids.map((uid) => ({ uid, name: profiles[uid]?.name ?? 'Traveler', avatarUrl: profiles[uid]?.avatarUrl ?? null })),
    [memberUids, profiles],
  );

  const { totalSpent, settleUp } = useMemo(() => computeBalances(expenses), [expenses]);
  const currency = trip?.budgetCurrency ?? 'USD';
  const budgetAmount = trip?.budgetAmount ?? null;
  const remaining = budgetAmount != null ? budgetAmount - totalSpent : null;
  const progress = budgetAmount ? Math.min(1, totalSpent / budgetAmount) : 0;

  const [addVisible, setAddVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const openBudgetEditor = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBudgetInput(budgetAmount != null ? String(budgetAmount) : '');
    setEditingBudget(true);
  }, [budgetAmount]);

  const saveBudget = useCallback(async () => {
    if (!id) return;
    const parsed = parseFloat(budgetInput);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateTrip(id, {
      budgetAmount: Number.isNaN(parsed) || parsed <= 0 ? null : parsed,
      budgetCurrency: 'USD',
    });
    setEditingBudget(false);
  }, [id, budgetInput, updateTrip]);

  const handleAddExpense = useCallback(
    async (data: ExpenseFormData) => {
      await addExpense.mutateAsync({ ...data, createdByUid: currentUid });
    },
    [addExpense, currentUid],
  );

  const handleDeleteExpense = useCallback(
    (expenseId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteExpense.mutate(expenseId);
    },
    [deleteExpense],
  );

  const renderExpense = useCallback(
    ({ item }: { item: Expense }) => {
      const { Icon, color } = EXPENSE_ICONS[item.category];
      const payerName = profiles[item.paidByUid]?.name ?? 'Someone';
      return (
        <View style={[styles.expenseRow, { borderColor: colors.background.cardBorder }]}>
          <View style={[styles.expenseIcon, { backgroundColor: `${color}1A` }]}>
            <Icon size={18} color={color} weight="duotone" />
          </View>
          <View style={styles.expenseText}>
            <Text style={[styles.expenseTitle, { color: colors.text.primary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.expenseMeta, { color: colors.text.tertiary }]} numberOfLines={1}>
              {payerName} paid · split {item.splitAmongUids.length} way{item.splitAmongUids.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={[styles.expenseAmount, { color: colors.text.primary }]}>
            {formatMoney(item.amount, currency)}
          </Text>
          {/* Persistent, visible delete — matches DayTimeline's "Delete day"
              pattern rather than a hidden long-press gesture. */}
          <TouchableOpacity
            onPress={() => handleDeleteExpense(item.id)}
            hitSlop={12}
            style={styles.expenseDeleteBtn}
            accessibilityLabel={`Delete ${item.title}`}
          >
            <TrashSimple size={16} color={colors.text.tertiary} weight="regular" />
          </TouchableOpacity>
        </View>
      );
    },
    [colors, currency, profiles, handleDeleteExpense],
  );

  if (tripLoading || !trip) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
        <SkeletonBlock height={120} radius={BorderRadius.xl} style={{ margin: Spacing['5'] }} />
        <SkeletonBlock height={60} radius={BorderRadius.lg} style={{ marginHorizontal: Spacing['5'] }} />
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
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>BUDGET</Text>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]} numberOfLines={1}>{trip.title}</Text>
        </View>
        <TouchableOpacity onPress={openBudgetEditor} style={styles.headerBtn} hitSlop={8} accessibilityLabel="Edit budget">
          <PencilSimple size={18} color={colors.text.secondary} weight="regular" />
        </TouchableOpacity>
      </View>

      <FlashList
        data={expenses}
        keyExtractor={(e) => e.id}
        renderItem={renderExpense}
        contentContainerStyle={{ paddingHorizontal: Spacing['5'], paddingBottom: insets.bottom + Spacing['20'] }}
        ListHeaderComponent={
          <View style={styles.summaryBlock}>
            {editingBudget ? (
              <View style={[styles.budgetEditor, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
                <Text style={[styles.currencyPrefix, { color: colors.text.secondary }]}>$</Text>
                <TextInput
                  value={budgetInput}
                  onChangeText={setBudgetInput}
                  placeholder="Trip budget"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="decimal-pad"
                  autoFocus
                  style={[styles.budgetInput, { color: colors.text.primary }]}
                  onSubmitEditing={saveBudget}
                />
                <Button label="Save" variant="primary" size="sm" onPress={saveBudget} haptic="none" />
              </View>
            ) : budgetAmount != null ? (
              <View style={[styles.summaryCard, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
                <Text style={[styles.spentAmount, { color: colors.text.primary }]}>{formatMoney(totalSpent, currency)}</Text>
                <Text style={[styles.spentLabel, { color: colors.text.secondary }]}>
                  of {formatMoney(budgetAmount, currency)} budgeted
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: colors.background.sunken }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progress * 100}%`, backgroundColor: remaining != null && remaining < 0 ? colors.semantic.error : colors.brand.purple },
                    ]}
                  />
                </View>
                <Text style={[styles.remainingText, { color: colors.text.tertiary }]}>
                  {remaining != null && remaining < 0
                    ? `${formatMoney(Math.abs(remaining), currency)} over budget`
                    : `${formatMoney(remaining ?? 0, currency)} remaining`}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.setBudgetPrompt, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
                onPress={openBudgetEditor}
                activeOpacity={0.7}
              >
                <Wallet size={20} color={colors.text.tertiary} weight="duotone" />
                <Text style={[styles.setBudgetText, { color: colors.text.secondary }]}>Set a budget for this trip</Text>
              </TouchableOpacity>
            )}

            {settleUp.length > 0 && (
              <View style={styles.settleSection}>
                <Text style={[styles.settleHeading, { color: colors.text.tertiary }]}>SETTLE UP</Text>
                {settleUp.map((line, i) => (
                  <View key={i} style={styles.settleRow}>
                    <Avatar uri={profiles[line.fromUid]?.avatarUrl ?? null} name={profiles[line.fromUid]?.name} size="xs" />
                    <Text style={[styles.settleText, { color: colors.text.primary }]} numberOfLines={1}>
                      {profiles[line.fromUid]?.name ?? 'Someone'}
                    </Text>
                    <ArrowRight size={13} color={colors.text.tertiary} weight="bold" />
                    <Avatar uri={profiles[line.toUid]?.avatarUrl ?? null} name={profiles[line.toUid]?.name} size="xs" />
                    <Text style={[styles.settleText, { color: colors.text.primary, flex: 1 }]} numberOfLines={1}>
                      {profiles[line.toUid]?.name ?? 'Someone'}
                    </Text>
                    <Text style={[styles.settleAmount, { color: colors.text.primary }]}>
                      {formatMoney(line.amount, currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {expenses.length > 0 && (
              <Text style={[styles.settleHeading, { color: colors.text.tertiary, marginTop: Spacing['5'] }]}>EXPENSES</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !expensesLoading ? (
            <EmptyState
              icon={Wallet}
              title="Track this trip's spending"
              description="Add an expense to start splitting costs with your tripmates."
              actionLabel="Add expense"
              onAction={() => setAddVisible(true)}
              actionHaptic="light"
            />
          ) : null
        }
      />

      {/* Once there are no expenses yet, the EmptyState above already
          offers "Add expense" — a second identical button here would just
          be noise, not a second option. */}
      {expenses.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing['3'], borderTopColor: colors.background.cardBorder, backgroundColor: colors.background.primary }]}>
          <Button
            label="Add expense"
            variant="primary"
            size="md"
            fullWidth
            onPress={() => setAddVisible(true)}
            haptic="none"
            icon={Plus}
          />
        </View>
      )}

      <AddExpenseSheet
        visible={addVisible}
        members={members}
        currentUid={currentUid}
        onClose={() => setAddVisible(false)}
        onSubmit={handleAddExpense}
      />
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
    paddingBottom: Spacing['4'],
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTextBlock: { flex: 1 },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
  },
  headerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, marginTop: 2 },

  summaryBlock: { paddingBottom: Spacing['4'] },
  summaryCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['5'],
    alignItems: 'center',
  },
  spentAmount: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['3xl'],
  },
  spentLabel: { fontSize: FontSize.sm, marginTop: 2 },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: Spacing['4'],
  },
  progressFill: { height: 6, borderRadius: 3 },
  remainingText: { fontSize: FontSize.xs, marginTop: Spacing['2'] },

  setBudgetPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['5'],
    minHeight: 44,
  },
  setBudgetText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  budgetEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  currencyPrefix: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold },
  budgetInput: { flex: 1, fontSize: FontSize.lg },

  settleSection: { marginTop: Spacing['5'], gap: Spacing['3'] },
  settleHeading: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
    marginBottom: Spacing['1'],
  },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  settleText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, maxWidth: 90 },
  settleAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },

  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingVertical: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseText: { flex: 1 },
  expenseTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  expenseMeta: { fontSize: FontSize.xs, marginTop: 2 },
  expenseAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  expenseDeleteBtn: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
