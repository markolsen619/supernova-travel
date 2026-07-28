import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { deleteField } from 'firebase/firestore';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { DateField } from '@/components/wallet/DateField';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useReservations } from '@/hooks/useReservations';
import { RESERVATION_ICONS } from '@/constants/icons';
import { ReservationType, Reservation } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const RESERVATION_TYPES: { type: ReservationType; label: string }[] = [
  { type: 'hotel', label: 'Hotel' },
  { type: 'airbnb', label: 'Airbnb' },
  { type: 'rental_car', label: 'Rental car' },
  { type: 'restaurant', label: 'Restaurant' },
  { type: 'activity', label: 'Activity' },
  { type: 'show', label: 'Show' },
];

export default function AddReservationScreen() {
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { reservations, addReservation, updateReservation } = useReservations();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const isEditMode = !!id;
  const existing = id ? reservations.find((r) => r.id === id) : undefined;

  const [type, setType] = useState<ReservationType>('hotel');
  const [title, setTitle] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);

  useEffect(() => {
    if (!existing) return;
    setType(existing.type);
    setTitle(existing.title);
    setConfirmationCode(existing.confirmationCode);
    setAddress(existing.address ?? '');
    setNotes(existing.notes ?? '');
    setCheckIn(existing.checkIn ? new Date(existing.checkIn) : null);
    setCheckOut(existing.checkOut ? new Date(existing.checkOut) : null);
  }, [existing]);

  const handleSelectType = useCallback((t: ReservationType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setType(t);
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !confirmationCode.trim()) {
      Alert.alert('Missing details', 'Enter a title and confirmation code to save it.');
      return;
    }
    if (!uid) {
      Alert.alert('Not signed in');
      return;
    }

    const baseFields = {
      type,
      title: title.trim(),
      confirmationCode: confirmationCode.trim(),
    };

    if (isEditMode && id) {
      // Edit mode uses deleteField() for blanked optional fields so clearing
      // check-in/check-out/address/notes actually clears them in Firestore,
      // rather than omitting the key (which would leave the prior value
      // untouched).
      const editFields: Record<string, unknown> = {
        ...baseFields,
        checkIn: checkIn ? checkIn.toISOString() : deleteField(),
        checkOut: checkOut ? checkOut.toISOString() : deleteField(),
        address: address.trim() || deleteField(),
        notes: notes.trim() || deleteField(),
      };
      updateReservation.mutate(
        { id, ...editFields } as Partial<Reservation> & { id: string },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The reservation didn't save. Try again."),
        },
      );
    } else {
      addReservation.mutate(
        {
          ownerUid: uid,
          ...baseFields,
          ...(checkIn ? { checkIn: checkIn.toISOString() } : {}),
          ...(checkOut ? { checkOut: checkOut.toISOString() } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          createdAt: new Date().toISOString(),
        },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The reservation didn't save. Try again."),
        },
      );
    }
  }, [type, title, confirmationCode, checkIn, checkOut, address, notes, uid, isEditMode, id, addReservation, updateReservation]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background.card,
      borderColor: colors.background.cardBorder,
      color: colors.text.primary,
    },
  ];

  const labelStyle = [styles.label, { color: colors.text.secondary }];
  const isPending = addReservation.isPending || updateReservation.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader
        title={isEditMode ? 'Edit reservation' : 'Add reservation'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type */}
        <Text style={labelStyle}>Type</Text>
        <View style={styles.typeRow}>
          {RESERVATION_TYPES.map(({ type: t, label }) => {
            const isSelected = type === t;
            const { Icon: TypeIcon, color: typeColor } = RESERVATION_ICONS[t];
            return (
              <TouchableOpacity
                key={t}
                onPress={() => handleSelectType(t)}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
                accessibilityLabel={`${label} reservation`}
              >
                <TypeIcon size={20} color={isSelected ? colors.brand.purple : typeColor} weight="duotone" />
                <Text
                  style={[
                    styles.typeLabel,
                    { color: isSelected ? colors.brand.purple : colors.text.secondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Title */}
        <Text style={labelStyle}>Title</Text>
        <TextInput
          style={inputStyle}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. The Ritz-Carlton, Tokyo"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Confirmation code */}
        <Text style={labelStyle}>Confirmation code</Text>
        <TextInput
          style={inputStyle}
          value={confirmationCode}
          onChangeText={setConfirmationCode}
          placeholder="e.g. RT4821"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="characters"
        />

        {/* Check-in / check-out */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <DateField
              label="Check-in"
              value={checkIn}
              onChange={setCheckIn}
              mode="date"
              placeholder="Select date"
            />
          </View>
          <View style={styles.rowItem}>
            <DateField
              label="Check-out"
              value={checkOut}
              onChange={setCheckOut}
              mode="date"
              placeholder="Select date"
            />
          </View>
        </View>

        {/* Address */}
        <Text style={labelStyle}>Address (optional)</Text>
        <TextInput
          style={inputStyle}
          value={address}
          onChangeText={setAddress}
          placeholder="e.g. 9 Chome-7-1 Ginza, Tokyo"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Notes */}
        <Text style={labelStyle}>Notes (optional)</Text>
        <TextInput
          style={[inputStyle, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          placeholderTextColor={colors.text.tertiary}
          multiline
        />

        {/* Submit */}
        <Button
          label={isEditMode ? 'Save changes' : 'Add reservation'}
          onPress={handleSubmit}
          loading={isPending}
          disabled={isPending}
          variant="primary"
          size="lg"
          fullWidth
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['1'],
    marginTop: Spacing['4'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  rowItem: {
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  typeButton: {
    flex: 1,
    minWidth: '30%',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['3'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['1'],
  },
  typeLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  submitButton: {
    marginTop: Spacing['6'],
  },
});
