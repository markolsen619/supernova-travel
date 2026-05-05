import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { LoyaltyProgram } from '@/types';
import { PointsBalance } from './PointsBalance';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius, Shadow } from '@/constants/spacing';

interface LoyaltyCardProps {
  program: LoyaltyProgram;
  onPress: () => void;
}

const PROGRAM_TYPE_ICONS: Record<LoyaltyProgram['programType'], string> = {
  airline: '✈️',
  hotel: '🏨',
  car_rental: '🚗',
  credit_card: '💳',
  other: '⭐',
};

export function LoyaltyCard({ program, onPress }: LoyaltyCardProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={colors.gradient.card}
        style={[
          styles.card,
          { borderColor: colors.background.cardBorder },
        ]}
      >
        <View style={styles.content}>
          {/* Left side */}
          <View style={styles.left}>
            <Text style={styles.typeIcon}>{PROGRAM_TYPE_ICONS[program.programType]}</Text>
            <View style={styles.nameBlock}>
              <Text
                style={[styles.programName, { color: colors.text.primary }]}
                numberOfLines={1}
              >
                {program.programName}
              </Text>
              {program.memberNumber ? (
                <Text style={[styles.memberNumber, { color: colors.text.tertiary }]} numberOfLines={1}>
                  {program.memberNumber}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Right side */}
          <PointsBalance
            balance={program.balance}
            unit={program.unit}
            tier={program.tier}
          />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['3'],
    borderRadius: BorderRadius.xl,
    ...Shadow.lg,
    elevation: 6,
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['4'],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing['3'],
  },
  typeIcon: {
    fontSize: 28,
    marginRight: Spacing['3'],
  },
  nameBlock: {
    flex: 1,
  },
  programName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  memberNumber: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
