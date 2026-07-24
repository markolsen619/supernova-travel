/**
 * components/trip/AddExpenseSheet.tsx
 *
 * Add-an-expense form — same page-sheet shell as EditTripSheet (a form this
 * size reads better as a full sheet than a short bottom-sheet picker).
 * "Paid by" is single-select, "split among" is multi-select, both drawn
 * from the trip's own member list (author + accepted collaborators) rather
 * than a fresh picker — a trip usually has only a handful of people on it.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EXPENSE_ICONS } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { ExpenseCategory } from '@/types';

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'transport', label: 'Transport' },
  { value: 'activities', label: 'Activities' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
];

export interface ExpenseFormData {
  title: string;
  amount: number;
  category: ExpenseCategory;
  paidByUid: string;
  splitAmongUids: string[];
}

interface Member {
  uid: string;
  name: string;
  avatarUrl: string | null;
}

interface AddExpenseSheetProps {
  visible: boolean;
  members: Member[];
  currentUid: string;
  onClose: () => void;
  onSubmit: (data: ExpenseFormData) => Promise<void>;
}

export function AddExpenseSheet({ visible, members, currentUid, onClose, onSubmit }: AddExpenseSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [paidByUid, setPaidByUid] = useState(currentUid);
  const [splitAmongUids, setSplitAmongUids] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setAmount('');
      setCategory('food');
      setPaidByUid(currentUid);
      setSplitAmongUids(members.map((m) => m.uid));
      setError(null);
    }
  }, [visible, currentUid, members]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const toggleSplitMember = useCallback((uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitAmongUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const parsedAmount = parseFloat(amount);
    if (!title.trim()) {
      setError('Give this expense a title.');
      return;
    }
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (splitAmongUids.length === 0) {
      setError('Split this among at least one person.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), amount: parsedAmount, category, paidByUid, splitAmongUids });
      onClose();
    } catch (err) {
      console.error('[AddExpenseSheet] save failed:', err);
      setError("Couldn't save this expense. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [saving, title, amount, category, paidByUid, splitAmongUids, onSubmit, onClose]);

  const fieldStyle = {
    color: colors.text.primary,
    backgroundColor: colors.background.card,
    borderColor: colors.background.cardBorder,
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + Spacing['2'], paddingBottom: insets.bottom + Spacing['8'] },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Add expense</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
                <X size={22} color={colors.text.secondary} weight="bold" />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={(t) => { setTitle(t); setError(null); }}
                  placeholder="Dinner at the marina"
                  placeholderTextColor={colors.text.tertiary}
                  style={[styles.input, fieldStyle]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Amount</Text>
                <TextInput
                  value={amount}
                  onChangeText={(t) => { setAmount(t); setError(null); }}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="decimal-pad"
                  style={[styles.input, fieldStyle]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Category</Text>
                <View style={styles.chipWrap}>
                  {CATEGORY_OPTIONS.map(({ value, label }) => {
                    const { Icon, color } = EXPENSE_ICONS[value];
                    const active = category === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCategory(value); }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.sunken,
                            borderColor: active ? colors.brand.purple : 'transparent',
                          },
                        ]}
                        accessibilityLabel={`${label} category`}
                      >
                        <Icon size={15} color={active ? colors.brand.purple : color} weight="duotone" />
                        <Text style={[styles.chipText, { color: active ? colors.brand.purple : colors.text.secondary }]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Paid by</Text>
                <View style={styles.memberList}>
                  {members.map((member) => {
                    const active = paidByUid === member.uid;
                    return (
                      <TouchableOpacity
                        key={member.uid}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPaidByUid(member.uid); }}
                        style={[
                          styles.memberRow,
                          { backgroundColor: active ? `${colors.brand.purple}14` : 'transparent' },
                        ]}
                        accessibilityLabel={`Paid by ${member.name}`}
                      >
                        <Avatar uri={member.avatarUrl} name={member.name} size="xs" />
                        <Text style={[styles.memberName, { color: colors.text.primary }]} numberOfLines={1}>
                          {member.name}
                        </Text>
                        <View
                          style={[
                            styles.radio,
                            { borderColor: active ? colors.brand.purple : colors.background.cardBorder },
                          ]}
                        >
                          {active && <View style={[styles.radioFill, { backgroundColor: colors.brand.purple }]} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Split among</Text>
                <View style={styles.memberList}>
                  {members.map((member) => {
                    const active = splitAmongUids.includes(member.uid);
                    return (
                      <TouchableOpacity
                        key={member.uid}
                        onPress={() => toggleSplitMember(member.uid)}
                        style={[
                          styles.memberRow,
                          { backgroundColor: active ? `${colors.brand.purple}14` : 'transparent' },
                        ]}
                        accessibilityLabel={`Include ${member.name} in split`}
                      >
                        <Avatar uri={member.avatarUrl} name={member.name} size="xs" />
                        <Text style={[styles.memberName, { color: colors.text.primary }]} numberOfLines={1}>
                          {member.name}
                        </Text>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              backgroundColor: active ? colors.brand.purple : 'transparent',
                              borderColor: active ? colors.brand.purple : colors.background.cardBorder,
                            },
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {error ? <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{error}</Text> : null}

              <Button
                label="Add expense"
                variant="primary"
                size="md"
                fullWidth
                loading={saving}
                onPress={handleSave}
                haptic="none"
                style={styles.saveBtn}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing['6'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing['4'],
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize.xl,
  },
  form: { gap: Spacing['4'] },
  fieldGroup: { gap: Spacing['2'] },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 36,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  memberList: { gap: Spacing['1'] },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.lg,
    minHeight: 44,
  },
  memberName: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: { width: 10, height: 10, borderRadius: 5 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
  },
  fieldError: {
    fontSize: FontSize.xs,
  },
  saveBtn: {
    marginTop: Spacing['2'],
  },
});
