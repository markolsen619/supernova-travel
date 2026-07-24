/**
 * components/trip/EditTripSheet.tsx
 *
 * Owner-only page-sheet for editing trip basics — title, description, dates,
 * visibility — plus the destructive delete path. Reuses the wizard's
 * DatePickerModal so date entry feels identical to trip creation.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X, CalendarBlank } from 'phosphor-react-native';

import { useTheme } from '@/hooks/useTheme';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { Button } from '@/components/ui/Button';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { VISIBILITY_ICONS } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { Trip, TripVisibility } from '@/types';

const VISIBILITY_OPTIONS: { value: TripVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'private', label: 'Private' },
];

interface EditTripSheetProps {
  visible: boolean;
  trip: Trip;
  onClose: () => void;
  /** Called after a confirmed, completed delete — navigate away here. */
  onDeleted: () => void;
}

export function EditTripSheet({ visible, trip, onClose, onDeleted }: EditTripSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { updateTrip, deleteTrip } = useCreateTrip();

  const [title, setTitle] = useState(trip.title);
  const [description, setDescription] = useState(trip.description ?? '');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [visibility, setVisibility] = useState<TripVisibility>(trip.visibility);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(trip.title);
      setDescription(trip.description ?? '');
      setStartDate(trip.startDate ? trip.startDate.toDate() : null);
      setEndDate(trip.endDate ? trip.endDate.toDate() : null);
      setVisibility(trip.visibility);
      setBudgetAmount(trip.budgetAmount != null ? String(trip.budgetAmount) : '');
      setTitleError(null);
      setSaveError(null);
    }
  }, [visible, trip]);

  const formatDate = (d: Date | null) =>
    d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (saving || deleting) return;
    if (!title.trim()) {
      setTitleError('Give your trip a title.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setSaveError('End date must be after start date.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    setSaveError(null);
    try {
      const parsedBudget = parseFloat(budgetAmount);
      await updateTrip(trip.id, {
        title: title.trim(),
        description: description.trim(),
        startDate,
        endDate,
        visibility,
        budgetAmount: budgetAmount.trim() && !Number.isNaN(parsedBudget) && parsedBudget > 0 ? parsedBudget : null,
        budgetCurrency: budgetAmount.trim() ? 'USD' : null,
      });
      onClose();
    } catch (err) {
      console.error('[EditTripSheet] save failed:', err);
      setSaveError("Couldn't save your changes. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [saving, deleting, title, description, startDate, endDate, visibility, budgetAmount, trip.id, updateTrip, onClose]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete this trip?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteTrip(trip.id);
            onDeleted();
          } catch (err) {
            console.error('[EditTripSheet] delete failed:', err);
            setSaveError("Couldn't delete the trip. Try again in a moment.");
            setDeleting(false);
          }
        },
      },
    ]);
  }, [trip.id, deleteTrip, onDeleted]);

  const fieldStyle = {
    color: colors.text.primary,
    backgroundColor: colors.background.card,
    borderColor: colors.background.cardBorder,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + Spacing['2'], paddingBottom: insets.bottom + Spacing['8'] },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Edit trip</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={22} color={colors.text.secondary} weight="bold" />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              {/* Title */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={(t) => { setTitle(t); setTitleError(null); }}
                  placeholder="Trip title"
                  placeholderTextColor={colors.text.tertiary}
                  style={[styles.input, fieldStyle, titleError ? { borderColor: colors.semantic.error } : null]}
                />
                {titleError ? (
                  <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{titleError}</Text>
                ) : null}
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What's this trip about?"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  style={[styles.input, styles.inputMultiline, fieldStyle]}
                />
              </View>

              {/* Dates */}
              <View style={styles.dateRow}>
                <View style={[styles.fieldGroup, styles.dateField]}>
                  <Text style={[styles.label, { color: colors.text.secondary }]}>Start date</Text>
                  <TouchableOpacity
                    style={[styles.input, styles.dateButton, fieldStyle]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowStart(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: startDate ? colors.text.primary : colors.text.tertiary, fontSize: FontSize.sm }}>
                      {formatDate(startDate)}
                    </Text>
                    <CalendarBlank size={18} color={colors.text.tertiary} weight="regular" />
                  </TouchableOpacity>
                </View>
                <View style={[styles.fieldGroup, styles.dateField]}>
                  <Text style={[styles.label, { color: colors.text.secondary }]}>End date</Text>
                  <TouchableOpacity
                    style={[styles.input, styles.dateButton, fieldStyle]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowEnd(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: endDate ? colors.text.primary : colors.text.tertiary, fontSize: FontSize.sm }}>
                      {formatDate(endDate)}
                    </Text>
                    <CalendarBlank size={18} color={colors.text.tertiary} weight="regular" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Visibility */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Visibility</Text>
                <View style={styles.visibilityRow}>
                  {VISIBILITY_OPTIONS.map(({ value, label }) => {
                    const { Icon, color } = VISIBILITY_ICONS[value];
                    const active = visibility === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVisibility(value); }}
                        style={[
                          styles.visibilityChip,
                          {
                            backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.sunken,
                            borderColor: active ? colors.brand.purple : 'transparent',
                          },
                        ]}
                        activeOpacity={0.75}
                        accessibilityLabel={`${label} visibility`}
                      >
                        <Icon size={16} color={active ? colors.brand.purple : color} weight="duotone" />
                        <Text
                          style={[
                            styles.visibilityText,
                            { color: active ? colors.brand.purple : colors.text.secondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Budget — same field as the budget screen's own editor;
                  either one can set it, both write the same trip fields. */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Budget (USD)</Text>
                <TextInput
                  value={budgetAmount}
                  onChangeText={setBudgetAmount}
                  placeholder="No budget set"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="decimal-pad"
                  style={[styles.input, fieldStyle]}
                />
              </View>

              {saveError ? (
                <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{saveError}</Text>
              ) : null}

              <Button
                label="Save changes"
                variant="primary"
                size="md"
                fullWidth
                loading={saving}
                disabled={deleting}
                onPress={handleSave}
                haptic="none"
                style={styles.saveBtn}
              />

              <Button
                label="Delete trip"
                variant="danger"
                size="md"
                fullWidth
                loading={deleting}
                disabled={saving}
                onPress={handleDelete}
                haptic="none"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <DatePickerModal
          visible={showStart}
          date={startDate}
          title="Select start date"
          onConfirm={(d) => { setStartDate(d); setShowStart(false); }}
          onCancel={() => setShowStart(false)}
        />
        <DatePickerModal
          visible={showEnd}
          date={endDate}
          title="Select end date"
          onConfirm={(d) => { setEndDate(d); setShowEnd(false); }}
          onCancel={() => setShowEnd(false)}
          minimumDate={startDate ?? undefined}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing['6'],
  },
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
  form: {
    gap: Spacing['4'],
  },
  fieldGroup: {
    gap: Spacing['2'],
  },
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
  inputMultiline: {
    height: 88,
    textAlignVertical: 'top',
    paddingTop: Spacing['3'],
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  dateField: {
    flex: 1,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  visibilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 36,
  },
  visibilityText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  fieldError: {
    fontSize: FontSize.xs,
  },
  saveBtn: {
    marginTop: Spacing['2'],
  },
});
