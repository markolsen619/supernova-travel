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
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { LoyaltyUnit, LoyaltyTier, LoyaltyProgram } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type ProgramType = LoyaltyProgram['programType'];

const PROGRAM_TYPES: { type: ProgramType; icon: string; label: string }[] = [
  { type: 'airline', icon: '✈️', label: 'Airline' },
  { type: 'hotel', icon: '🏨', label: 'Hotel' },
  { type: 'car_rental', icon: '🚗', label: 'Car Rental' },
  { type: 'credit_card', icon: '💳', label: 'Credit Card' },
  { type: 'other', icon: '⭐', label: 'Other' },
];

const UNITS: LoyaltyUnit[] = ['miles', 'points', 'nights', 'segments'];
const TIERS: LoyaltyTier[] = ['standard', 'silver', 'gold', 'platinum', 'diamond'];

const UNIT_LABELS: Record<LoyaltyUnit, string> = {
  miles: 'Miles',
  points: 'Points',
  nights: 'Nights',
  segments: 'Segments',
};

const TIER_LABELS: Record<LoyaltyTier, string> = {
  standard: 'Standard',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
};

export default function AddLoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { addProgram } = useLoyaltyPrograms();

  const [programName, setProgramName] = useState('');
  const [programType, setProgramType] = useState<ProgramType>('airline');
  const [memberNumber, setMemberNumber] = useState('');
  const [balanceText, setBalanceText] = useState('');
  const [unit, setUnit] = useState<LoyaltyUnit>('miles');
  const [tier, setTier] = useState<LoyaltyTier>('standard');
  const [expiryDate, setExpiryDate] = useState('');

  const handleSubmit = useCallback(() => {
    if (!programName.trim()) {
      Alert.alert('Missing Fields', 'Please enter a program name.');
      return;
    }
    if (!balanceText.trim() || isNaN(Number(balanceText))) {
      Alert.alert('Invalid Balance', 'Please enter a valid balance number.');
      return;
    }
    if (!uid) {
      Alert.alert('Not signed in');
      return;
    }

    addProgram.mutate(
      {
        ownerUid: uid,
        programName: programName.trim(),
        programType,
        memberNumber: memberNumber.trim() || undefined,
        balance: Number(balanceText),
        unit,
        tier,
        expiryDate: expiryDate.trim() || undefined,
        isManual: true,
        createdAt: new Date().toISOString(),
      },
      {
        onSuccess: () => router.back(),
        onError: () => Alert.alert('Error', 'Failed to save loyalty program. Please try again.'),
      },
    );
  }, [programName, programType, memberNumber, balanceText, unit, tier, expiryDate, uid, addProgram]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background.card,
      borderColor: colors.background.cardBorder,
      color: colors.text.primary,
    },
  ];

  const labelStyle = [styles.label, { color: colors.text.secondary }];

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.brand.purple }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Add Loyalty Program</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Program Name */}
        <Text style={labelStyle}>Program Name</Text>
        <TextInput
          style={inputStyle}
          value={programName}
          onChangeText={setProgramName}
          placeholder="e.g. Delta SkyMiles"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Program Type */}
        <Text style={labelStyle}>Program Type</Text>
        <View style={styles.typeRow}>
          {PROGRAM_TYPES.map(({ type, icon, label }) => {
            const isSelected = programType === type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => setProgramType(type)}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: isSelected ? colors.brand.purple : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text style={styles.typeIcon}>{icon}</Text>
                <Text
                  style={[
                    styles.typeLabel,
                    { color: isSelected ? '#ffffff' : colors.text.secondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Member Number */}
        <Text style={labelStyle}>Member Number (optional)</Text>
        <TextInput
          style={inputStyle}
          value={memberNumber}
          onChangeText={setMemberNumber}
          placeholder="e.g. 1234567890"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="none"
          keyboardType="default"
        />

        {/* Balance */}
        <Text style={labelStyle}>Balance</Text>
        <TextInput
          style={inputStyle}
          value={balanceText}
          onChangeText={setBalanceText}
          placeholder="e.g. 50000"
          placeholderTextColor={colors.text.tertiary}
          keyboardType="numeric"
        />

        {/* Unit */}
        <Text style={labelStyle}>Unit</Text>
        <View style={styles.optionRow}>
          {UNITS.map((u) => {
            const isSelected = unit === u;
            return (
              <TouchableOpacity
                key={u}
                onPress={() => setUnit(u)}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: isSelected ? colors.brand.purple : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: isSelected ? '#ffffff' : colors.text.secondary },
                  ]}
                >
                  {UNIT_LABELS[u]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tier */}
        <Text style={labelStyle}>Tier</Text>
        <View style={styles.optionRow}>
          {TIERS.map((t) => {
            const isSelected = tier === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTier(t)}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: isSelected ? colors.brand.purple : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: isSelected ? '#ffffff' : colors.text.secondary },
                  ]}
                >
                  {TIER_LABELS[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expiry Date */}
        <Text style={labelStyle}>Expiry Date (optional)</Text>
        <TextInput
          style={inputStyle}
          value={expiryDate}
          onChangeText={setExpiryDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="none"
          keyboardType="default"
        />

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: colors.brand.purple, opacity: addProgram.isPending ? 0.7 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={addProgram.isPending}
          activeOpacity={0.8}
        >
          <Text style={[styles.submitButtonText, { color: '#ffffff' }]}>
            {addProgram.isPending ? 'Saving...' : 'Add Loyalty Program'}
          </Text>
        </TouchableOpacity>
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
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
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
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  typeButton: {
    flex: 1,
    minWidth: '18%',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['3'],
    alignItems: 'center',
    gap: Spacing['1'],
  },
  typeIcon: {
    fontSize: 20,
  },
  typeLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  optionButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  submitButton: {
    marginTop: Spacing['6'],
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
