import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { LoyaltyUnit, LoyaltyTier } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface PointsBalanceProps {
  balance: number;
  unit: LoyaltyUnit;
  tier?: LoyaltyTier;
}

const UNIT_LABELS: Record<LoyaltyUnit, string> = {
  miles: 'Miles',
  points: 'Points',
  nights: 'Nights',
  segments: 'Segments',
};

const TIER_LABELS: Record<LoyaltyTier, string> = {
  standard: '',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
};

export function PointsBalance({ balance, unit, tier }: PointsBalanceProps) {
  const { colors } = useTheme();

  const formattedBalance = new Intl.NumberFormat('en-US').format(balance);
  const unitLabel = UNIT_LABELS[unit];

  const tierColor = (() => {
    if (!tier || tier === 'standard') return null;
    if (tier === 'silver') return colors.text.tertiary;
    if (tier === 'gold') return colors.accent.amber;
    if (tier === 'platinum') return colors.brand.blue;
    if (tier === 'diamond') return colors.brand.purple;
    return null;
  })();

  const tierLabel = tier ? TIER_LABELS[tier] : '';

  return (
    <View style={styles.container}>
      <View style={styles.balanceRow}>
        <Text style={[styles.balance, { color: colors.text.primary }]}>{formattedBalance}</Text>
        <Text style={[styles.unit, { color: colors.text.secondary }]}> {unitLabel}</Text>
      </View>
      {tierColor && tierLabel ? (
        <Text style={[styles.tierBadge, { color: tierColor }]}>{tierLabel}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  balance: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  unit: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  tierBadge: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    marginTop: Spacing['1'],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
