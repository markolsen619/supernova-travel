import React, { useState } from 'react';
import { View, Text, Modal, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export interface DatePickerModalProps {
  visible: boolean;
  date: Date | null;
  title: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  minimumDate?: Date;
}

/** Shared date-entry sheet — extracted from the trip wizard so trip editing
 * uses the exact same affordance. */
export function DatePickerModal({ visible, date, title, onConfirm, onCancel, minimumDate }: DatePickerModalProps) {
  const { colors } = useTheme();
  const now = date ?? new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [day, setDay] = useState(String(now.getDate()).padStart(2, '0'));

  const handleConfirm = () => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10) - 1;
    const d = parseInt(day, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return;
    const parsed = new Date(y, m, d);
    if (isNaN(parsed.getTime())) return;
    if (minimumDate && parsed < minimumDate) return;
    onConfirm(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={dp.overlay}>
        <View style={[dp.sheet, { backgroundColor: colors.background.elevated }]}>
          <Text style={[dp.sheetTitle, { color: colors.text.primary }]}>{title}</Text>
          <Text style={[dp.hint, { color: colors.text.tertiary }]}>Enter date (YYYY · MM · DD)</Text>
          <View style={dp.row}>
            <View style={dp.field}>
              <Text style={[dp.fieldLabel, { color: colors.text.secondary }]}>Year</Text>
              <TextInput
                style={[dp.fieldInput, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
                value={year}
                onChangeText={setYear}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="2025"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
            <View style={dp.field}>
              <Text style={[dp.fieldLabel, { color: colors.text.secondary }]}>Month</Text>
              <TextInput
                style={[dp.fieldInput, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
                value={month}
                onChangeText={setMonth}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="01"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
            <View style={dp.field}>
              <Text style={[dp.fieldLabel, { color: colors.text.secondary }]}>Day</Text>
              <TextInput
                style={[dp.fieldInput, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
                value={day}
                onChangeText={setDay}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="01"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
          </View>
          <View style={dp.actions}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} haptic="light" style={dp.actionBtn} />
            <Button label="Set date" variant="primary" onPress={handleConfirm} haptic="light" style={dp.actionBtn} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    padding: Spacing['6'],
    paddingBottom: Spacing['10'],
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing['2'],
  },
  hint: {
    fontSize: FontSize.sm,
    marginBottom: Spacing['5'],
  },
  row: { flexDirection: 'row', gap: Spacing['3'] },
  field: { flex: 1 },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['2'],
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: Spacing['3'], marginTop: Spacing['6'] },
  actionBtn: { flex: 1 },
});
