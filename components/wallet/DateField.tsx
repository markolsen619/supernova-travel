import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CalendarBlank, Clock } from 'phosphor-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  mode: 'date' | 'time';
  placeholder: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

// The iOS-modal-spinner / Android-native-dialog date picker pattern
// app/(auth)/sign-up.tsx established for date-of-birth entry, generalized
// into a date-or-time field reused across the three wallet forms.
export function DateField({
  label,
  value,
  onChange,
  mode,
  placeholder,
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const openPicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(true);
  }, []);

  const closePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(false);
  }, []);

  const handleChange = useCallback(
    (_: unknown, selectedDate?: Date) => {
      if (Platform.OS === 'android') setShowPicker(false);
      if (selectedDate) onChange(selectedDate);
    },
    [onChange]
  );

  const formattedValue = value
    ? mode === 'date'
      ? value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : placeholder;

  const Icon = mode === 'date' ? CalendarBlank : Clock;

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.input,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
        ]}
        onPress={openPicker}
        activeOpacity={0.8}
      >
        <Icon size={18} color={value ? colors.text.primary : colors.text.tertiary} weight="regular" />
        <Text style={[styles.valueText, { color: value ? colors.text.primary : colors.text.tertiary }]}>
          {formattedValue}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' && showPicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <TouchableOpacity style={styles.pickerBackdrop} onPress={closePicker} />
            <View style={[styles.pickerSheet, { backgroundColor: colors.background.elevated }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: colors.background.cardBorder }]}>
                <TouchableOpacity onPress={closePicker} hitSlop={8}>
                  <Text style={[styles.pickerDone, { color: colors.brand.purple }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value ?? new Date()}
                mode={mode}
                display="spinner"
                onChange={handleChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={value ?? new Date()}
          mode={mode}
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: Spacing['4'] },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing['1'] },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    minHeight: 44,
  },
  valueText: { fontSize: FontSize.base, flex: 1 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerDone: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
