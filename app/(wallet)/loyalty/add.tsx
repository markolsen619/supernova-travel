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
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { DateField } from '@/components/wallet/DateField';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { LOYALTY_ICONS } from '@/constants/icons';
import { LoyaltyUnit, LoyaltyTier, LoyaltyProgram } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type ProgramType = LoyaltyProgram['programType'];

const PROGRAM_TYPES: { type: ProgramType; label: string }[] = [
  { type: 'airline', label: 'Airline' },
  { type: 'hotel', label: 'Hotel' },
  { type: 'car_rental', label: 'Car rental' },
  { type: 'credit_card', label: 'Credit card' },
  { type: 'other', label: 'Other' },
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
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { loyaltyPrograms, addProgram, updateProgram } = useLoyaltyPrograms();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const isEditMode = !!id;
  const existing = id ? loyaltyPrograms.find((p) => p.id === id) : undefined;

  const [programName, setProgramName] = useState('');
  const [programType, setProgramType] = useState<ProgramType>('airline');
  const [memberNumber, setMemberNumber] = useState('');
  const [balanceText, setBalanceText] = useState('');
  const [unit, setUnit] = useState<LoyaltyUnit>('miles');
  const [tier, setTier] = useState<LoyaltyTier>('standard');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!existing) return;
    setProgramName(existing.programName);
    setProgramType(existing.programType);
    setMemberNumber(existing.memberNumber ?? '');
    setBalanceText(String(existing.balance));
    setUnit(existing.unit);
    setTier(existing.tier ?? 'standard');
    setExpiryDate(existing.expiryDate ? new Date(existing.expiryDate) : null);
  }, [existing]);

  const handleSubmit = useCallback(() => {
    if (!programName.trim()) {
      Alert.alert('Missing details', 'Enter a program name to save it.');
      return;
    }
    if (!balanceText.trim() || isNaN(Number(balanceText))) {
      Alert.alert('Invalid balance', 'Enter the balance as a number.');
      return;
    }
    if (!uid) {
      Alert.alert('Not signed in');
      return;
    }

    const fields = {
      programName: programName.trim(),
      programType,
      ...(memberNumber.trim() ? { memberNumber: memberNumber.trim() } : {}),
      balance: Number(balanceText),
      unit,
      tier,
      ...(expiryDate ? { expiryDate: expiryDate.toISOString() } : {}),
    };

    if (isEditMode && id) {
      updateProgram.mutate(
        { id, ...fields },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The program didn't save. Try again."),
        },
      );
    } else {
      addProgram.mutate(
        { ownerUid: uid, ...fields, isManual: true, createdAt: new Date().toISOString() },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The program didn't save. Try again."),
        },
      );
    }
  }, [programName, programType, memberNumber, balanceText, unit, tier, expiryDate, uid, isEditMode, id, addProgram, updateProgram]);

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

  const handleSelectType = useCallback((t: ProgramType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setProgramType(t);
  }, []);

  const handleSelectUnit = useCallback((u: LoyaltyUnit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUnit(u);
  }, []);

  const handleSelectTier = useCallback((t: LoyaltyTier) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier(t);
  }, []);

  const isPending = addProgram.isPending || updateProgram.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader
        title={isEditMode ? 'Edit loyalty program' : 'Add loyalty program'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Program Name */}
        <Text style={labelStyle}>Program name</Text>
        <TextInput
          style={inputStyle}
          value={programName}
          onChangeText={setProgramName}
          placeholder="e.g. Delta SkyMiles"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Program Type */}
        <Text style={labelStyle}>Program type</Text>
        <View style={styles.typeRow}>
          {PROGRAM_TYPES.map(({ type, label }) => {
            const isSelected = programType === type;
            const { Icon: TypeIcon, color: typeColor } = LOYALTY_ICONS[type];
            return (
              <TouchableOpacity
                key={type}
                onPress={() => handleSelectType(type)}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
                accessibilityLabel={`${label} program`}
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

        {/* Member Number */}
        <Text style={labelStyle}>Member number (optional)</Text>
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
                onPress={() => handleSelectUnit(u)}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: isSelected ? colors.brand.purple : colors.text.secondary },
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
                onPress={() => handleSelectTier(t)}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: isSelected ? colors.brand.purple : colors.text.secondary },
                  ]}
                >
                  {TIER_LABELS[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expiry Date */}
        <DateField
          label="Expiry date (optional)"
          value={expiryDate}
          onChange={setExpiryDate}
          mode="date"
          placeholder="Select date"
        />

        {/* Submit */}
        <Button
          label={isEditMode ? 'Save changes' : 'Add loyalty program'}
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
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  typeButton: {
    flex: 1,
    minWidth: '18%',
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  submitButton: {
    marginTop: Spacing['6'],
  },
});
