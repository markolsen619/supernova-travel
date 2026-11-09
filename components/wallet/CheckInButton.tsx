/**
 * Day-of assistant (spec 2026-11-01): "Check in online" (until departure) opening the airline's page, and for Pro
 * the leave-for-the-airport time once the server has worked it out.
 */
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { AirplaneTakeoff, Clock } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useProGate } from '@/hooks/useProGate';
import { checkInUrl, checkInVisible, leaveByLine } from '@/utils/dayOf';
import type { BoardingPass } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const CheckInButton = memo(function CheckInButton({ pass, style }: { pass: BoardingPass; style?: ViewStyle }) {
  const { colors } = useTheme();
  const { isPro } = useProGate();
  const departed = Date.parse(pass.departureTime) <= Date.now();
  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    WebBrowser.openBrowserAsync(checkInUrl(pass.airline, pass.flightNumber));
  }, [pass.airline, pass.flightNumber]);
  const leave = isPro ? leaveByLine(pass) : null;
  if (departed || pass.status === 'cancelled' || pass.status === 'completed') return null;
  const canCheckIn = checkInVisible(pass, Date.now());
  if (!leave && !canCheckIn) return null;
  return (
    <View style={[styles.wrap, style]}>
      {leave ? (
        <View style={styles.leave}>
          <Clock size={16} color={colors.brand.purple} weight="bold" />
          <Text style={[styles.leaveText, { color: colors.text.primary }]}>{leave}</Text>
        </View>
      ) : null}
      {canCheckIn ? (
      <Pressable onPress={open} style={[styles.btn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
        accessibilityRole="link" accessibilityLabel={`Check in online with ${pass.airline || 'the airline'}`}>
        <AirplaneTakeoff size={18} color={colors.text.primary} weight="bold" />
        <Text style={[styles.btnText, { color: colors.text.primary }]}>Check in online</Text>
      </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: Spacing['2'] },
  leave: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  leaveText: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'], minHeight: 48, borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth },
  btnText: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
