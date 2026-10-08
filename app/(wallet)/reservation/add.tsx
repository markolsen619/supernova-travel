import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useBookingMatch } from '@/hooks/useBookingMatch';
import { draftPlaceFields } from '@/utils/walletLink';
import { reservationKind } from '@/utils/bookingDays';
import { chunk, normalizeTime } from '@/utils/transitTime';
import * as Haptics from 'expo-haptics';
import { deleteField } from 'firebase/firestore';
import { toCalendarDate, parseCalendarDate } from '@/utils/calendarDate';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { DateField } from '@/components/wallet/DateField';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useImportDraftStore } from '@/stores/useImportDraftStore';
import { useReservations } from '@/hooks/useReservations';
import { RESERVATION_ICONS } from '@/constants/icons';
import { ReservationType, Reservation } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { useWalletAllowance } from '@/hooks/useWalletAllowance';

const RESERVATION_TYPES: { type: ReservationType; label: string }[] = [
  { type: 'hotel', label: 'Hotel' },
  { type: 'airbnb', label: 'Airbnb' },
  { type: 'rental_car', label: 'Rental car' },
  { type: 'restaurant', label: 'Restaurant' },
  { type: 'activity', label: 'Activity' },
  { type: 'show', label: 'Show' },
  { type: 'transit', label: 'Train, bus or ferry' },
];

export default function AddReservationScreen() {
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { reservations, addReservation, updateReservation } = useReservations();
  const { id, draft: draftParam } = useLocalSearchParams<{ id?: string; draft?: string }>();
  const draft = useImportDraftStore((s) => s.draft);
  const clearDraft = useImportDraftStore((s) => s.clearDraft);

  const isEditMode = !!id;
  // Free plan: two wallet items in total (utils/proFeatures). Edits are always allowed.
  const allowance = useWalletAllowance();
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
    setType(reservationKind(existing));
    setTitle(existing.title);
    setConfirmationCode(existing.confirmationCode);
    setAddress(existing.address ?? '');
    setNotes(existing.notes ?? '');
    setFromPlace(existing.fromPlace ?? '');
    setToPlace(existing.toPlace ?? '');
    setDeparts(existing.departureLocalTime ?? '');
    setArrives(existing.arrivalLocalTime ?? '');
    setSeat(existing.seat ?? '');
    setOperator(existing.operator ?? '');
    setCheckIn(existing.checkIn ? parseCalendarDate(existing.checkIn) : null);
    setCheckOut(existing.checkOut ? parseCalendarDate(existing.checkOut) : null);
  }, [existing]);

  // Train / bus / ferry: route and times as printed on the ticket.
  const [fromPlace, setFromPlace] = useState('');
  const [toPlace, setToPlace] = useState('');
  const [departs, setDeparts] = useState('');
  const [arrives, setArrives] = useState('');
  const [seat, setSeat] = useState('');
  const [operator, setOperator] = useState('');

  // The import draft is cleared once it fills the form, so its place fields are kept here for the save.
  const [draftPlace, setDraftPlace] = useState<Record<string, string>>({});
  const { afterSave } = useBookingMatch();

  useEffect(() => {
    if (draftParam !== 'true' || !draft || draft.kind !== 'reservation') return;
    // The server hands a transit ticket over as an activity with a transitMode (older apps can't draw 'transit').
    setType(draft.fields.transitMode ? 'transit' : draft.reservationType);
    if (draft.fields.title) setTitle(draft.fields.title);
    if (draft.fields.confirmationCode) setConfirmationCode(draft.fields.confirmationCode);
    if (draft.fields.address) setAddress(draft.fields.address);
    if (draft.fields.notes) setNotes(draft.fields.notes);
    if (draft.fields.checkIn) setCheckIn(parseCalendarDate(draft.fields.checkIn));
    if (draft.fields.checkOut) setCheckOut(parseCalendarDate(draft.fields.checkOut));
    const place = draftPlaceFields(draft);
    setDraftPlace(place);
    setFromPlace(place.fromPlace ?? '');
    setToPlace(place.toPlace ?? '');
    setDeparts(place.departureLocalTime ?? '');
    setArrives(place.arrivalLocalTime ?? '');
    setSeat(place.seat ?? '');
    setOperator(place.operator ?? '');
    clearDraft();
  }, [draftParam, draft, clearDraft]);

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

    // Train/bus/ferry is stored as an activity + transitMode — apps before
    // 1.0.3 crash on an unknown type (utils/bookingDays reservationKind).
    const isTransit = type === 'transit';
    const departsTime = departs.trim() ? normalizeTime(departs) : null;
    const arrivesTime = arrives.trim() ? normalizeTime(arrives) : null;
    if (isTransit && ((departs.trim() && !departsTime) || (arrives.trim() && !arrivesTime))) {
      Alert.alert('Check the times', 'Enter times as they appear on the ticket, like 10:19.');
      return;
    }
    // The form owns these fields now — they replace whatever the import guessed.
    const transitValues: Record<string, string | undefined> = isTransit
      ? {
          fromPlace: fromPlace.trim() || undefined,
          toPlace: toPlace.trim() || undefined,
          departureLocalTime: departsTime ?? undefined,
          arrivalLocalTime: arrivesTime ?? undefined,
          seat: seat.trim() || undefined,
          operator: operator.trim() || undefined,
        }
      : {};
    const transitMode = isTransit ? (existing?.transitMode ?? (draftPlace.transitMode as Reservation['transitMode']) ?? 'train') : undefined;
    const baseFields = {
      type: isTransit ? 'activity' as const : type,
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
        transitMode: transitMode ?? deleteField(),
        // Blank (or no longer a train) clears them, rather than leaving the old values.
        fromPlace: transitValues.fromPlace ?? deleteField(),
        toPlace: transitValues.toPlace ?? deleteField(),
        departureLocalTime: transitValues.departureLocalTime ?? deleteField(),
        arrivalLocalTime: transitValues.arrivalLocalTime ?? deleteField(),
        seat: transitValues.seat ?? deleteField(),
        operator: transitValues.operator ?? deleteField(),
        checkIn: checkIn ? toCalendarDate(checkIn) : deleteField(),
        checkOut: checkOut ? toCalendarDate(checkOut) : deleteField(),
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
      if (!allowance.canAdd) {
        allowance.openPaywall();
        return;
      }
      addReservation.mutate(
        {
          ownerUid: uid,
          ...baseFields,
          ...(checkIn ? { checkIn: toCalendarDate(checkIn) } : {}),
          ...(checkOut ? { checkOut: toCalendarDate(checkOut) } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          createdAt: new Date().toISOString(),
          // Where it is, for matching it to a trip (Pro; bookingMatch.ts).
          ...draftPlace,
          ...(transitMode ? { transitMode } : {}),
          ...Object.fromEntries(Object.entries(transitValues).filter(([, v]) => v !== undefined)),
        },
        {
          onSuccess: (newId) => {
            router.back();
            afterSave('reservation', newId);
          },
          onError: () => Alert.alert('Save failed', "The reservation didn't save. Try again."),
        },
      );
    }
  }, [type, title, confirmationCode, checkIn, checkOut, address, notes, uid, isEditMode, id, addReservation, updateReservation, allowance, draftPlace, afterSave, existing?.transitMode, fromPlace, toPlace, departs, arrives, seat, operator]);

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
    <View
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <WalletHeader
        title={isEditMode ? 'Edit reservation' : 'Add reservation'}
        onBack={handleBack}
      />

      <ScrollView
        // iOS insets the content by the keyboard and scrolls the focused field
        // into view — padding the whole screen instead left fields low on the
        // form (Additional preferences) typed into behind the keyboard.
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type */}
        <Text style={labelStyle}>Type</Text>
        {/* Explicit rows of three: a wrapping row with gaps mis-measures its height
            once it needs a third line, and the fields below were drawn over it. */}
        {chunk(RESERVATION_TYPES, 3).map((rowTypes, rowIndex) => (
        <View key={rowIndex} style={styles.typeRow}>
          {rowTypes.map(({ type: t, label }) => {
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
          {/* Keep a short last row's buttons the same width as the rows above. */}
          {Array.from({ length: 3 - rowTypes.length }, (_, i) => <View key={`pad-${i}`} style={styles.typeSpacer} />)}
        </View>
        ))}

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

        {type === 'transit' && (
          <>
            <Text style={labelStyle}>From</Text>
            <TextInput style={inputStyle} value={fromPlace} onChangeText={setFromPlace} placeholder="e.g. München Hbf" placeholderTextColor={colors.text.tertiary} />
            <Text style={labelStyle}>To</Text>
            <TextInput style={inputStyle} value={toPlace} onChangeText={setToPlace} placeholder="e.g. Köln Messe/Deutz" placeholderTextColor={colors.text.tertiary} />
          </>
        )}

        {/* Date(s) — a train has one date and its times as printed */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <DateField
              label={type === 'transit' ? 'Date' : 'Check-in'}
              value={checkIn}
              onChange={setCheckIn}
              mode="date"
              placeholder="Select date"
            />
          </View>
          {type !== 'transit' && (
          <View style={styles.rowItem}>
            <DateField
              label="Check-out"
              value={checkOut}
              onChange={setCheckOut}
              mode="date"
              placeholder="Select date"
            />
          </View>
          )}
        </View>

        {type === 'transit' && (
          <>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={labelStyle}>Departs</Text>
                <TextInput style={inputStyle} value={departs} onChangeText={setDeparts} placeholder="10:19" placeholderTextColor={colors.text.tertiary} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={styles.rowItem}>
                <Text style={labelStyle}>Arrives</Text>
                <TextInput style={inputStyle} value={arrives} onChangeText={setArrives} placeholder="14:29" placeholderTextColor={colors.text.tertiary} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            <Text style={[styles.hint, { color: colors.text.tertiary }]}>Times as printed on the ticket, local to each station.</Text>
            <Text style={labelStyle}>Seat (optional)</Text>
            <TextInput style={inputStyle} value={seat} onChangeText={setSeat} placeholder="e.g. 55 (car 39)" placeholderTextColor={colors.text.tertiary} />
            <Text style={labelStyle}>Operator (optional)</Text>
            <TextInput style={inputStyle} value={operator} onChangeText={setOperator} placeholder="e.g. Deutsche Bahn" placeholderTextColor={colors.text.tertiary} />
          </>
        )}

        {type !== 'transit' && (
          <>
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
          </>
        )}

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
    </View>
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
    gap: Spacing['2'],
    marginBottom: Spacing['2'],
  },
  typeSpacer: { flex: 1 },
  typeButton: {
    flex: 1,
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
  hint: { fontSize: 13, marginTop: Spacing['1'] },
  submitButton: {
    marginTop: Spacing['6'],
  },
});
