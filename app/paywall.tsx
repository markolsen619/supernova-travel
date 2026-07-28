import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X, Sparkle } from 'phosphor-react-native';
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

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Paywall is sometimes reached via router.replace() (onboarding's "See
    // plans", the AI-quota-exceeded redirect) rather than push, which leaves
    // no back target — router.back() would throw GO_BACK not handled.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const handleMonthlyPurchase = () => {
    Alert.alert('RevenueCat', 'Purchase flow requires EAS build');
  };

  const handleAnnualPurchase = () => {
    Alert.alert('RevenueCat', 'Purchase flow requires EAS build');
  };

  return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Go Pro
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={8} accessibilityLabel="Close">
            <X size={20} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing['8'] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — the one hit of brand gradient on this screen. */}
          <View style={styles.hero}>
            <View style={[styles.heroIconBubble, { backgroundColor: `${colors.brand.purple}1F` }]}>
              <Sparkle size={30} color={colors.brand.purple} weight="duotone" />
            </View>
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

          {/* Purchase Buttons — both genuinely write a subscription, so both
              are Medium regardless of visual weight (variant is about
              hierarchy, not this haptic). */}
          <View style={styles.buttonStack}>
            <Button
              label="Start monthly plan"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleMonthlyPurchase}
            />
            <View style={styles.buttonGap} />
            <Button
              label="Start annual plan"
              variant="secondary"
              size="lg"
              fullWidth
              haptic="medium"
              onPress={handleAnnualPurchase}
            />
          </View>

          {/* Restore Purchases */}
          <View style={styles.restoreContainer}>
            <Button
              label="Restore purchases"
              variant="ghost"
              size="md"
              haptic="medium"
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
  );
}

const styles = StyleSheet.create({
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
  scrollContent: {
    paddingHorizontal: Spacing['5'],
  },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing['6'],
  },
  heroIconBubble: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
