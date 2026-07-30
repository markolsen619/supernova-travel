import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
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
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { combineDateAndTime } from '@/utils/date';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { BoardingPass } from '@/types';

interface FormState {
  airline: string;
  flightNumber: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  seat: string;
  gate: string;
  terminal: string;
}

const INITIAL_FORM: FormState = {
  airline: '',
  flightNumber: '',
  origin: '',
  originCity: '',
  destination: '',
  destinationCity: '',
  seat: '',
  gate: '',
  terminal: '',
};

export default function AddBoardingPassScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { boardingPasses, addPass, updatePass } = useBoardingPasses();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const isEditMode = !!id;
  const existing = id ? boardingPasses.find((p) => p.id === id) : undefined;

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [departureDate, setDepartureDate] = useState<Date | null>(null);
  const [departureTime, setDepartureTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!existing) return;
    setForm({
      airline: existing.airline,
      flightNumber: existing.flightNumber,
      origin: existing.origin,
      originCity: existing.originCity,
      destination: existing.destination,
      destinationCity: existing.destinationCity,
      seat: existing.seat ?? '',
      gate: existing.gate ?? '',
      terminal: existing.terminal ?? '',
    });
    const existingDeparture = new Date(existing.departureTime);
    setDepartureDate(existingDeparture);
    setDepartureTime(existingDeparture);
  }, [existing]);

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.airline.trim() || !form.flightNumber.trim() || !form.origin.trim() || !form.destination.trim()) {
      Alert.alert('Missing details', 'Fill in airline, flight number, origin, and destination.');
      return;
    }
    if (!user?.uid) {
      Alert.alert('Not signed in');
      return;
    }

    const departureTimeIso =
      departureDate && departureTime
        ? combineDateAndTime(departureDate, departureTime)
        : new Date().toISOString();

    const baseFields = {
      airline: form.airline.trim(),
      flightNumber: form.flightNumber.trim().toUpperCase(),
      origin: form.origin.trim().toUpperCase(),
      originCity: form.originCity.trim(),
      destination: form.destination.trim().toUpperCase(),
      destinationCity: form.destinationCity.trim(),
      departureTime: departureTimeIso,
    };

    if (isEditMode && id) {
      // Edit mode uses deleteField() for blanked optional fields so clearing
      // seat/gate/terminal actually clears them in Firestore, rather than
      // omitting the key (which would leave the prior value untouched).
      const editFields: Record<string, unknown> = {
        ...baseFields,
        seat: form.seat.trim() || deleteField(),
        gate: form.gate.trim() || deleteField(),
        terminal: form.terminal.trim() || deleteField(),
      };
      updatePass.mutate(
        { id, ...editFields } as Partial<BoardingPass> & { id: string },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The pass didn't save. Try again."),
        },
      );
    } else {
      addPass.mutate(
        {
          ownerUid: user.uid,
          ...baseFields,
          ...(form.seat.trim() ? { seat: form.seat.trim() } : {}),
          ...(form.gate.trim() ? { gate: form.gate.trim() } : {}),
          ...(form.terminal.trim() ? { terminal: form.terminal.trim() } : {}),
          status: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The pass didn't save. Try again."),
        },
      );
    }
  }, [form, user, departureDate, departureTime, isEditMode, id, updatePass, addPass]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background.card,
      borderColor: colors.background.cardBorder,
      color: colors.text.primary,
    },
  ];

  const labelStyle = [styles.label, { color: colors.text.secondary }];

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const isPending = addPass.isPending || updatePass.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader
        title={isEditMode ? 'Edit boarding pass' : 'Add boarding pass'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Airline */}
        <Text style={labelStyle}>Airline</Text>
        <TextInput
          style={inputStyle}
          value={form.airline}
          onChangeText={(v) => updateField('airline', v)}
          placeholder="e.g. Delta Air Lines"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Flight Number */}
        <Text style={labelStyle}>Flight number</Text>
        <TextInput
          style={inputStyle}
          value={form.flightNumber}
          onChangeText={(v) => updateField('flightNumber', v)}
          placeholder="e.g. DL405"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="characters"
        />

        {/* Origin row */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Origin (IATA)</Text>
            <TextInput
              style={inputStyle}
              value={form.origin}
              onChangeText={(v) => updateField('origin', v)}
              placeholder="JFK"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
              maxLength={3}
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Origin city</Text>
            <TextInput
              style={inputStyle}
              value={form.originCity}
              onChangeText={(v) => updateField('originCity', v)}
              placeholder="New York"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Destination row */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Destination (IATA)</Text>
            <TextInput
              style={inputStyle}
              value={form.destination}
              onChangeText={(v) => updateField('destination', v)}
              placeholder="LHR"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
              maxLength={3}
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Destination city</Text>
            <TextInput
              style={inputStyle}
              value={form.destinationCity}
              onChangeText={(v) => updateField('destinationCity', v)}
              placeholder="London"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Departure date & time */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <DateField
              label="Departure date"
              value={departureDate}
              onChange={setDepartureDate}
              mode="date"
              placeholder="Select date"
            />
          </View>
          <View style={styles.rowItem}>
            <DateField
              label="Departure time"
              value={departureTime}
              onChange={setDepartureTime}
              mode="time"
              placeholder="Select time"
            />
          </View>
        </View>

        {/* Seat, Gate & Terminal row */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Seat</Text>
            <TextInput
              style={inputStyle}
              value={form.seat}
              onChangeText={(v) => updateField('seat', v)}
              placeholder="14A"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Gate</Text>
            <TextInput
              style={inputStyle}
              value={form.gate}
              onChangeText={(v) => updateField('gate', v)}
              placeholder="B22"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Terminal</Text>
            <TextInput
              style={inputStyle}
              value={form.terminal}
              onChangeText={(v) => updateField('terminal', v)}
              placeholder="4"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Submit */}
        <Button
          label={isEditMode ? 'Save changes' : 'Add boarding pass'}
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
  row: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  rowItem: {
    flex: 1,
  },
  submitButton: {
    marginTop: Spacing['6'],
  },
});
