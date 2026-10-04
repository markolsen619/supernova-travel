import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { doc, updateDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle } from 'phosphor-react-native';
import { db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBookingBannerStore } from '@/stores/useBookingBannerStore';
import { linkPatch } from '@/utils/walletLink';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

const VISIBLE_MS = 5000;

/** "Added to {trip}" with Undo, after a saved booking linked itself to a trip. Mounted once in the wallet layout. */
export function BookingLinkedBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();
  const banner = useBookingBannerStore((s) => s.banner);
  const clear = useBookingBannerStore((s) => s.clear);
  const translateY = useRef(new Animated.Value(120)).current;

  const hide = useCallback(() => {
    Animated.spring(translateY, { toValue: 120, ...SPRING }).start(() => clear());
  }, [translateY, clear]);

  useEffect(() => {
    if (!banner) return;
    translateY.setValue(120);
    Animated.spring(translateY, { toValue: 0, ...SPRING }).start();
    const timer = setTimeout(hide, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [banner, translateY, hide]);

  const undo = useCallback(async () => {
    if (!banner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const col = banner.kind === 'boarding_pass' ? 'boarding_passes' : 'reservations';
    try {
      await updateDoc(doc(db, col, banner.id), linkPatch('undo'));
      queryClient.invalidateQueries({ queryKey: [banner.kind === 'boarding_pass' ? 'boardingPasses' : 'reservations', uid] });
      queryClient.invalidateQueries({ queryKey: ['tripBookings'] });
    } catch (err) {
      console.warn('[wallet] undo link failed', err);
    }
    hide();
  }, [banner, queryClient, uid, hide]);

  if (!banner) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + Spacing['4'], transform: [{ translateY }] }]}
    >
      <View
        style={[styles.banner, { backgroundColor: colors.background.elevated, borderColor: colors.background.cardBorder }]}
      >
        <CheckCircle size={20} color={colors.text.primary} weight="duotone" />
        <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.text.primary }]} numberOfLines={2}>
          Added to {banner.trip.title}
        </Text>
        <TouchableOpacity onPress={undo} style={styles.undo} accessibilityRole="button" accessibilityLabel="Undo">
          <Text style={[styles.undoText, { color: colors.text.primary }]}>Undo</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing['5'], right: Spacing['5'] },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingLeft: Spacing['4'],
    borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, minHeight: 56,
  },
  text: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  undo: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing['4'] },
  undoText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
