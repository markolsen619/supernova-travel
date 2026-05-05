import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { usePurchases } from '@/hooks/usePurchases';
import { Button } from '@/components/ui/Button';
import { PaywallFeatureList } from '@/components/paywall/PaywallFeatureList';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { restorePurchases, isLoading } = usePurchases();

  const handleMonthlyPurchase = () => {
    Alert.alert('RevenueCat', 'Purchase flow requires EAS build');
  };

  const handleAnnualPurchase = () => {
    Alert.alert('RevenueCat', 'Purchase flow requires EAS build');
  };

  return (
    <LinearGradient
      colors={colors.gradient.dark}
      style={styles.gradient}
    >
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Go Pro
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: colors.text.secondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing['8'] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>✨</Text>
            <Text style={[styles.heroTitle, { color: colors.text.primary }]}>
              Supernova Pro
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.text.secondary }]}>
              Unlock the full travel experience
            </Text>
          </View>

          {/* Feature List */}
          <View style={[styles.featureContainer, { borderColor: colors.background.cardBorder }]}>
            <PaywallFeatureList />
          </View>

          {/* Price Block */}
          <View style={styles.priceBlock}>
            <Text style={[styles.monthlyPrice, { color: colors.text.primary }]}>
              $4.99 / month
            </Text>
            <Text style={[styles.annualPrice, { color: colors.text.secondary }]}>
              $39.99 / year (save 33%)
            </Text>
          </View>

          {/* Purchase Buttons */}
          <View style={styles.buttonStack}>
            <Button
              label="Start Monthly Plan"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleMonthlyPurchase}
            />
            <View style={styles.buttonGap} />
            <Button
              label="Start Annual Plan"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={handleAnnualPurchase}
            />
          </View>

          {/* Restore Purchases */}
          <View style={styles.restoreContainer}>
            <Button
              label="Restore Purchases"
              variant="ghost"
              size="md"
              onPress={restorePurchases}
              loading={isLoading}
            />
          </View>

          {/* Fine Print */}
          <Text style={[styles.finePrint, { color: colors.text.tertiary }]}>
            Cancel anytime. Prices may vary by region.
          </Text>
        </ScrollView>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['4'],
    position: 'relative',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  closeButton: {
    position: 'absolute',
    right: Spacing['5'],
    bottom: Spacing['4'],
    padding: Spacing['2'],
  },
  closeText: {
    fontSize: FontSize.md,
  },
  scrollContent: {
    paddingHorizontal: Spacing['5'],
  },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing['6'],
  },
  heroEmoji: {
    fontSize: 56,
    marginBottom: Spacing['3'],
  },
  heroTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    marginBottom: Spacing['2'],
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  featureContainer: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['4'],
    marginBottom: Spacing['6'],
  },
  priceBlock: {
    alignItems: 'center',
    marginBottom: Spacing['6'],
  },
  monthlyPrice: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing['1'],
  },
  annualPrice: {
    fontSize: FontSize.base,
  },
  buttonStack: {
    marginBottom: Spacing['4'],
  },
  buttonGap: {
    height: Spacing['3'],
  },
  restoreContainer: {
    alignItems: 'center',
    marginBottom: Spacing['4'],
  },
  finePrint: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginBottom: Spacing['2'],
  },
});
