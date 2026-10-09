/**
 * components/trip/EditTripSheet.tsx
 *
 * Owner-only page-sheet for editing trip basics — title, description, dates,
 * visibility — plus the destructive delete path. Reuses the wizard's
 * DateRangeField so date entry feels identical to trip creation.
 */

import { useUserStore } from '@/stores/useUserStore';
import { isPrivateAccount, publicAllowed } from '@/utils/privacy';
import { useTripBudgetAmount } from '@/hooks/useTripBudget';
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
import { X } from 'phosphor-react-native';

import { useTheme } from '@/hooks/useTheme';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { Button } from '@/components/ui/Button';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { VISIBILITY_ICONS } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { TripVisibility, TripWithDays } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { draftFromRows, previewRoute, routeRowsFromTrip, useTripRoute, type RouteDraft } from '@/hooks/useTripRoute';
import { absorbEndDateChange, dropsWarning } from '@/utils/tripRoute';
import { toCalendarDate } from '@/utils/calendarDate';
import { containsObjectionableText, OBJECTIONABLE_TEXT_MESSAGE } from '@/utils/contentFilter';

const VISIBILITY_OPTIONS: { value: TripVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'private', label: 'Private' },
];

interface EditTripSheetProps {
  visible: boolean;
  trip: TripWithDays;
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
  // A private account can't make a trip Public (firestore.rules refuses it).
  const publicOk = publicAllowed(isPrivateAccount(useUserStore((s) => s.profile)));
  const [budgetAmount, setBudgetAmount] = useState('');
  // The budget is private to the trip's members (trips/{id}/private/budget); only the owner opens this sheet.
  const { budget, setBudget } = useTripBudgetAmount(trip.id, true);
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
      setBudgetAmount(budget ? String(budget.amount) : '');
      setTitleError(null);
      setSaveError(null);
    }
  }, [visible, trip, budget]);

  const handleDatesChange = useCallback((start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const { saveRoute } = useTripRoute();
  const save = useCallback(async (confirmedDrops: boolean) => {
    if (saving || deleting) return;
    if (!title.trim()) {
      setTitleError('Give your trip a title.');
      return;
    }
    if (containsObjectionableText(title) || containsObjectionableText(description)) {
      setSaveError(OBJECTIONABLE_TEXT_MESSAGE);
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setSaveError('End date must be after start date.');
      return;
    }
    // A multi-city trip's new dates move its cities; a new end date lengthens or
    // shortens the last city (utils/tripRoute absorbEndDateChange).
    let routeTrip: TripWithDays | null = null;
    let routeDraft: RouteDraft | null = null;
    const day = (d: Date | null) => (d ? toCalendarDate(d) : null);
    const datesChanged = day(startDate) !== day(trip.startDate?.toDate() ?? null) || day(endDate) !== day(trip.endDate?.toDate() ?? null);
    if (trip.additionalDestinations.length > 0 && startDate && endDate && datesChanged) {
      routeTrip = { ...trip, startDate: Timestamp.fromDate(startDate) };
      const rows = routeRowsFromTrip(routeTrip);
      const nights = absorbEndDateChange(rows.map((r) => r.nights), toCalendarDate(startDate), toCalendarDate(endDate));
      routeDraft = draftFromRows(rows.map((r, i) => ({ ...r, nights: nights[i] })));
      const plan = previewRoute(routeTrip, routeDraft);
      if (plan.dropsWithStops.length > 0 && !confirmedDrops) {
        const names = [trip.destination.name, ...trip.additionalDestinations.map((d) => d.name)];
        Alert.alert('Delete these days?', dropsWarning(plan.dropsWithStops, names), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete and save', style: 'destructive', onPress: () => { save(true); } },
        ]);
        return;
      }
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
      });
      if (routeTrip && routeDraft) await saveRoute(routeTrip, routeDraft);
      const nextBudget = budgetAmount.trim() && !Number.isNaN(parsedBudget) && parsedBudget > 0 ? parsedBudget : null;
      if (nextBudget !== (budget?.amount ?? null)) await setBudget.mutateAsync(nextBudget);
      onClose();
    } catch (err) {
      console.error('[EditTripSheet] save failed:', err);
      setSaveError("Couldn't save your changes. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [saving, deleting, title, description, startDate, endDate, visibility, budgetAmount, trip, updateTrip, saveRoute, onClose, budget, setBudget]);
  const handleSave = useCallback(() => { save(false); }, [save]);

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
          behavior={Platform.OS === 'android' ? 'height' : undefined}
        >
          <ScrollView
            // iOS insets the content by the keyboard and scrolls the focused field
            // into view — padding the whole screen instead left fields low on the
            // form (Additional preferences) typed into behind the keyboard.
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="on-drag"
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
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Trip dates</Text>
                <DateRangeField start={startDate} end={endDate} onChange={handleDatesChange} />
              </View>

              {/* Visibility */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Visibility</Text>
                {!publicOk ? (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 6 }}>Your account is private — trips are visible to followers</Text>
                ) : null}
                <View style={styles.visibilityRow}>
                  {VISIBILITY_OPTIONS.map(({ value, label }) => {
                    const { Icon, color } = VISIBILITY_ICONS[value];
                    const active = visibility === value;
                    const unavailable = value === 'public' && !publicOk;
                    return (
                      <TouchableOpacity
                        key={value}
                        disabled={unavailable}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVisibility(value); }}
                        style={[
                          unavailable && { opacity: 0.4 },
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
