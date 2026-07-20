import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface FormState {
  airline: string;
  flightNumber: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departureTime: string;
  seat: string;
  gate: string;
}

const INITIAL_FORM: FormState = {
  airline: '',
  flightNumber: '',
  origin: '',
  originCity: '',
  destination: '',
  destinationCity: '',
  departureTime: '',
  seat: '',
  gate: '',
};

export default function AddBoardingPassScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { addPass } = useBoardingPasses();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!form.airline.trim() || !form.flightNumber.trim() || !form.origin.trim() || !form.destination.trim()) {
      Alert.alert('Missing details', 'Fill in airline, flight number, origin, and destination.');
      return;
    }
    if (!user?.uid) {
      Alert.alert('Not signed in');
      return;
    }

    addPass.mutate(
      {
        ownerUid: user.uid,
        airline: form.airline.trim(),
        flightNumber: form.flightNumber.trim().toUpperCase(),
        origin: form.origin.trim().toUpperCase(),
        originCity: form.originCity.trim(),
        destination: form.destination.trim().toUpperCase(),
        destinationCity: form.destinationCity.trim(),
        departureTime: form.departureTime.trim() || new Date().toISOString(),
        seat: form.seat.trim() || undefined,
        gate: form.gate.trim() || undefined,
        status: 'upcoming',
        createdAt: new Date().toISOString(),
      },
      {
        onSuccess: () => router.back(),
        onError: () => Alert.alert('Save failed', 'The pass didn\'t save. Try again.'),
      },
    );
  };

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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing['4'],
            borderBottomColor: colors.background.cardBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <View style={styles.titleGroup}>
          <StarMark size={18} />
          <Text style={[styles.title, { color: colors.text.primary }]}>Add boarding pass</Text>
        </View>
        <View style={styles.backButton} />
      </View>

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

        {/* Departure time */}
        <Text style={labelStyle}>Departure time</Text>
        <TextInput
          style={inputStyle}
          value={form.departureTime}
          onChangeText={(v) => updateField('departureTime', v)}
          placeholder="2025-08-15T10:30:00"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="none"
          keyboardType="default"
        />

        {/* Seat & Gate row */}
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
        </View>

        {/* Submit */}
        <Button
          label="Add boarding pass"
          onPress={handleSubmit}
          loading={addPass.isPending}
          disabled={addPass.isPending}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  starIcon: { width: 18, height: 18 },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  scroll: {
    flex: 1,
  },
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
