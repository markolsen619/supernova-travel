import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BellSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useNotificationBannerStore } from '@/stores/useNotificationBannerStore';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

const VISIBLE_MS = 5000;

/**
 * Repeats the tapped notification at the top of the screen it opened, so you
 * know why you're there. Mounted once in app/_layout.tsx; tap to dismiss.
 */
export function NotificationArrivalBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const banner = useNotificationBannerStore((s) => s.banner);
  const clear = useNotificationBannerStore((s) => s.clear);
  const translateY = useRef(new Animated.Value(-160)).current;

  const hide = useCallback(() => {
    Animated.spring(translateY, { toValue: -160, ...SPRING }).start(() => clear());
  }, [translateY, clear]);

  useEffect(() => {
    if (!banner) return;
    translateY.setValue(-160);
    Animated.spring(translateY, { toValue: 0, ...SPRING }).start();
    const timer = setTimeout(hide, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [banner, translateY, hide]);

  const dismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    hide();
  }, [hide]);

  if (!banner) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing['2'], transform: [{ translateY }] }]}>
      <TouchableOpacity
        onPress={dismiss}
        activeOpacity={0.85}
        style={[styles.banner, { backgroundColor: colors.background.elevated, borderColor: colors.background.cardBorder }]}
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}. ${banner.body}. Dismiss`}
      >
        <BellSimple size={20} color={colors.text.primary} weight="duotone" />
        <View style={styles.text}>
          <Text accessibilityLiveRegion="polite" style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>
            {banner.title}
          </Text>
          {!!banner.body && (
            <Text style={[styles.body, { color: colors.text.secondary }]} numberOfLines={2}>{banner.body}</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing['5'], right: Spacing['5'], zIndex: 100 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, minHeight: 56,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  body: { fontSize: 13 },
});
