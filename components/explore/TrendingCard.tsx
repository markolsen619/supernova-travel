import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - Spacing['6'] * 2 - Spacing['3']) / 2;

interface TrendingCardProps {
  name: string;
  country: string;
  emoji: string;
  tripCount?: number;
  onPress?: () => void;
}

export function TrendingCard({
  name,
  country,
  emoji,
  tripCount,
  onPress,
}: TrendingCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.shadowWrapper, { shadowColor: colors.brand.purple }]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.touchable}
      >
        <LinearGradient
          colors={colors.gradient.card}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.border,
            { borderColor: colors.background.cardBorder },
          ]}
        />
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.name, { color: colors.text.primary }]}>
          {name}
        </Text>
        <Text style={[styles.country, { color: colors.text.tertiary }]}>
          {country}
        </Text>
        {tripCount !== undefined && (
          <Text style={[styles.tripCount, { color: colors.text.secondary }]}>
            {tripCount} {tripCount === 1 ? 'trip' : 'trips'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    width: CARD_WIDTH,
    aspectRatio: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    borderRadius: BorderRadius.xl,
  },
  touchable: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['3'],
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 36,
    marginBottom: Spacing['2'],
  },
  name: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    marginBottom: 2,
  },
  country: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginBottom: 2,
  },
  tripCount: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    marginTop: 2,
  },
});
