import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X, Sparkle, WifiSlash } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { usePurchases } from '@/hooks/usePurchases';
import { useOfferings } from '@/hooks/useOfferings';
import { Button } from '@/components/ui/Button';
import { PaywallFeatureList } from '@/components/paywall/PaywallFeatureList';
import { PlanOption } from '@/components/paywall/PlanOption';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { defaultSelectedPlanId } from '@/utils/offerings';

/** House spring — every state change on this screen uses it. */
const SPRING = { tension: 65, friction: 11, useNativeDriver: true };

function PlanSkeleton() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View accessibilityLabel="Loading plans">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[styles.skeleton, { backgroundColor: colors.background.sunken, opacity: pulse }]}
        />
      ))}
    </View>
  );
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { plans, isLoading, isError, refetch } = useOfferings();
  const { purchase, restorePurchases, isPurchasing, isRestoring, error, clearError } = usePurchases();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Pre-select the annual plan once offerings land.
  useEffect(() => {
    if (selectedId === null && plans.length > 0) {
      setSelectedId(defaultSelectedPlanId(plans));
    }
  }, [plans, selectedId]);

  const entry = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(entry, { toValue: 1, ...SPRING }).start();
  }, [entry]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? null,
    [plans, selectedId],
  );

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

  const handleSelect = useCallback(
    (id: string) => {
      clearError();
      setNotice(null);
      setSelectedId(id);
    },
    [clearError],
  );

  const handlePurchase = useCallback(async () => {
    if (!selectedPlan) return;
    setNotice(null);
    const outcome = await purchase(selectedPlan.pkg);

    if (outcome.status === 'purchased') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
      return;
    }
    if (outcome.status === 'pending') {
      setNotice('Your payment is pending approval. Pro unlocks as soon as it clears.');
    }
    // 'cancelled' is silent by design; 'error' surfaces through `error`.
  }, [selectedPlan, purchase, handleClose]);

  const handleRestore = useCallback(async () => {
    setNotice(null);
    const restored = await restorePurchases();
    if (restored) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
    }
  }, [restorePurchases, handleClose]);

  const ctaLabel = selectedPlan
    ? selectedPlan.isLifetime
      ? 'Unlock lifetime access'
      : `Start ${selectedPlan.title.toLowerCase()} plan`
    : 'Choose a plan';

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['3'] }]}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={20} color={colors.text.secondary} weight="bold" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing['8'] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: entry,
            transform: [{ translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}
        >
          {/* Hero. The eyebrow above the title is the editorial signature. */}
          <View style={styles.hero}>
            <View style={[styles.heroIconBubble, { backgroundColor: `${colors.brand.purple}1F` }]}>
              <Sparkle size={28} color={colors.brand.purple} weight="duotone" />
            </View>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>SUPERNOVA PRO</Text>
            <Text style={[styles.heroTitle, { color: colors.text.primary }]}>
              Travel without limits
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.text.secondary }]}>
              Unlimited AI itineraries, and every trip you plan in one place.
            </Text>
          </View>

          <View style={[styles.featureContainer, { borderColor: colors.background.cardBorder }]}>
            <PaywallFeatureList />
          </View>

          {/* Plans */}
          {isLoading && <PlanSkeleton />}

          {!isLoading && plans.length === 0 && (
            /* Empty state: icon + title + description + action. */
            <View style={styles.emptyState}>
              <WifiSlash size={26} color={colors.text.disabled} weight="duotone" />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
                Plans didn&apos;t load
              </Text>
              <Text style={[styles.emptyBody, { color: colors.text.secondary }]}>
                {isError
                  ? "We couldn't reach the store. Check your connection and try again."
                  : 'No plans are available for your region right now.'}
              </Text>
              <Button label="Try again" variant="secondary" size="md" onPress={() => refetch()} />
            </View>
          )}

          {!isLoading && plans.length > 0 && (
            <View accessibilityRole="radiogroup">
              {plans.map((plan) => (
                <PlanOption
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selectedId}
                  onSelect={handleSelect}
                />
              ))}
            </View>
          )}

          {(error || notice) && (
            <Text
              style={[styles.message, { color: error ? colors.semantic.error : colors.text.secondary }]}
              accessibilityLiveRegion="polite"
            >
              {error ?? notice}
            </Text>
          )}

          {/* The single primary action on this screen. */}
          {plans.length > 0 && (
            <View style={styles.ctaContainer}>
              <Button
                label={ctaLabel}
                variant="primary"
                size="lg"
                fullWidth
                loading={isPurchasing}
                disabled={!selectedPlan || isPurchasing}
                onPress={handlePurchase}
              />
            </View>
          )}

          {/* Restore is a text link, not a competing button. Apple requires a
              visible restore path when selling a non-consumable (lifetime). */}
          <View style={styles.restoreContainer}>
            <Button
              label="Restore purchases"
              variant="ghost"
              size="md"
              onPress={handleRestore}
              loading={isRestoring}
            />
          </View>

          <Text style={[styles.finePrint, { color: colors.text.tertiary }]}>
            Subscriptions renew automatically until cancelled. Manage or cancel in your store
            account settings. Lifetime is a one-time purchase.
          </Text>
        </Animated.View>
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
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['2'],
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing['5'],
  },
  hero: {
    alignItems: 'center',
    paddingTop: Spacing['2'],
    paddingBottom: Spacing['7'],
  },
  heroIconBubble: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['4'],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.9,
    marginBottom: Spacing['2'],
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.5,
    marginBottom: Spacing['2'],
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
    textAlign: 'center',
    paddingHorizontal: Spacing['4'],
  },
  featureContainer: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['4'],
    marginBottom: Spacing['7'],
  },
  skeleton: {
    height: 64,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing['3'],
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing['2'],
    paddingVertical: Spacing['6'],
  },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    marginTop: Spacing['1'],
  },
  emptyBody: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    textAlign: 'center',
    marginBottom: Spacing['3'],
    paddingHorizontal: Spacing['4'],
  },
  message: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    textAlign: 'center',
    marginBottom: Spacing['3'],
  },
  ctaContainer: {
    marginTop: Spacing['1'],
  },
  restoreContainer: {
    alignItems: 'center',
    marginTop: Spacing['2'],
    marginBottom: Spacing['3'],
  },
  finePrint: {
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs * 1.5,
    textAlign: 'center',
  },
});
