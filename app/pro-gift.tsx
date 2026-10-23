import { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { PaywallFeatureList } from '@/components/paywall/PaywallFeatureList';
import { FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import { giftEndLabel } from '@/utils/androidGift';

/**
 * "A year of Pro, on us" — shown once, right after the server granted the
 * Android welcome gift (hooks/useAndroidGift).
 */
export default function ProGiftScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ends } = useLocalSearchParams<{ ends?: string }>();
  const endsAtMs = Number(ends);
  const until = Number.isFinite(endsAtMs) && endsAtMs > 0 ? giftEndLabel(endsAtMs) : null;
  const pop = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(pop, { toValue: 1, ...SPRING }).start();
  }, [pop]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary, paddingBottom: insets.bottom + Spacing['4'] }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Image source={require('@/assets/images/SupernovaStar.png')} style={styles.star} accessibilityIgnoresInvertColors />
        </Animated.View>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>WELCOME TO SUPERNOVA</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>A year of Pro, on us</Text>
        <Text style={[styles.lede, { color: colors.text.secondary }]}>
          You&apos;re one of our first travelers on Android, so Pro is yours free{until ? ` until ${until}` : ' for a year'}. No card, and nothing renews.
        </Text>
        <View style={styles.features}>
          <PaywallFeatureList />
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Start exploring" onPress={close} haptic="light" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['8'], gap: Spacing['2'] },
  star: { width: 56, height: 56 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginTop: Spacing['4'] },
  title: { fontSize: 28, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  lede: { fontSize: 15, lineHeight: 22, marginTop: Spacing['1'] },
  features: { marginTop: Spacing['6'] },
  actions: { paddingHorizontal: Spacing['5'] },
});
