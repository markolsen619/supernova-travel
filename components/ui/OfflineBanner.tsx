import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiSlash } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useIsOnline } from '@/services/offline';

/** Clears the tab bar (and the home indicator) so the pill never sits on a control. */
const ABOVE_TAB_BAR = 72;

/**
 * "You're offline · Showing your saved trips" — a small pill that springs up near the bottom while there is no
 * signal. Not a full-width top strip: every screen's header buttons live at the top (final review, 2026-10-19).
 */
export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const y = useRef(new Animated.Value(online ? 120 : 0)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: online ? 120 : 0, tension: 65, friction: 11, useNativeDriver: true }).start();
  }, [online, y]);
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + ABOVE_TAB_BAR }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityElementsHidden={online}
        importantForAccessibility={online ? 'no-hide-descendants' : 'yes'}
        style={[styles.pill, { backgroundColor: colors.text.primary, transform: [{ translateY: y }], opacity: online ? 0 : 1 }]}
      >
        <WifiSlash size={14} color={colors.background.primary} weight="bold" />
        <Text style={[styles.text, { color: colors.background.primary }]}>You&apos;re offline · Showing your saved trips</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  text: { fontSize: 13, fontWeight: '500' },
});
