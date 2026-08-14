import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CalendarBlank } from 'phosphor-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { isUnder13 } from '@/utils/age';

type BirthdayFieldProps = {
  value: Date | null;
  onChange: (d: Date) => void;
  onValidityChange: (valid: boolean) => void;
};

export default function BirthdayField({ value, onChange, onValidityChange }: BirthdayFieldProps) {
  const { colors } = useTheme();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 13);

  const underAge = !!value && isUnder13(value);

  useEffect(() => {
    onValidityChange(!!value && !isUnder13(value));
  }, [value, onValidityChange]);

  const openDatePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDatePicker(true);
  }, []);

  const closeDatePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDatePicker(false);
  }, []);

  const onDateChange = useCallback((_: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) onChange(selectedDate);
  }, [onChange]);

  const formatDob = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>Date of birth</Text>
      <TouchableOpacity
        style={[
          styles.input,
          styles.dobRow,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
        ]}
        onPress={openDatePicker}
        activeOpacity={0.8}
      >
        <CalendarBlank
          size={18}
          color={value ? colors.text.primary : colors.text.tertiary}
          weight="regular"
        />
        <Text style={[styles.dobText, { color: value ? colors.text.primary : colors.text.tertiary }]}>
          {value ? formatDob(value) : 'Select your date of birth'}
        </Text>
      </TouchableOpacity>
      {underAge ? (
        <Text style={[styles.fieldError, { color: colors.semantic.error }]}>
          You must be 13 or older to use Supernova.
        </Text>
      ) : null}

      {/* iOS date picker in a bottom sheet modal — matches the rest of the
          (now light) form, not hardcoded dark. */}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <TouchableOpacity style={styles.pickerBackdrop} onPress={closeDatePicker} />
            <View style={[styles.pickerSheet, { backgroundColor: colors.background.elevated }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: colors.background.cardBorder }]}>
                <TouchableOpacity onPress={closeDatePicker} hitSlop={8}>
                  <Text style={[styles.pickerDone, { color: colors.brand.purple }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value ?? maxDobDate}
                mode="date"
                display="spinner"
                onChange={onDateChange}
                maximumDate={maxDobDate}
                minimumDate={new Date(1900, 0, 1)}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android shows native dialog when showDatePicker is true */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={value ?? maxDobDate}
          mode="date"
          display="default"
          onChange={onDateChange}
          maximumDate={maxDobDate}
          minimumDate={new Date(1900, 0, 1)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: Spacing['5'] },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['2'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    fontSize: FontSize.base,
  },
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  dobText: { fontSize: FontSize.base, flex: 1 },
  fieldError: { fontSize: FontSize.xs, marginTop: Spacing['2'] },

  // Date picker modal
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
  pickerDone: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
});
