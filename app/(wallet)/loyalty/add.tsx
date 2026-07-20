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
        onError: () => Alert.alert('Save failed', 'The program didn\'t save. Try again.'),
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
          <Text style={[styles.title, { color: colors.text.primary }]}>Add loyalty program</Text>
        </View>
        <View style={styles.backButton} />
      </View>

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
        <Text style={labelStyle}>Expiry date (optional)</Text>
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
        <Button
          label="Add loyalty program"
          onPress={handleSubmit}
          loading={addProgram.isPending}
          disabled={addProgram.isPending}
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
