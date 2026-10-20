// components/ui/OfflineBanner.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiSlash } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useIsOnline } from '@/services/offline';

/** "You're offline · Showing your saved trips" — springs in at the top while there is no signal. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const y = useRef(new Animated.Value(online ? -80 : 0)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: online ? -80 : 0, tension: 65, friction: 11, useNativeDriver: true }).start();
  }, [online, y]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityElementsHidden={online}
      style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: colors.text.primary, transform: [{ translateY: y }] }]}
    >
      <WifiSlash size={14} color={colors.background.primary} weight="bold" />
      <Text style={[styles.text, { color: colors.background.primary }]}>You&apos;re offline · Showing your saved trips</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 8 },
  text: { fontSize: 13, fontWeight: '500' },
});
