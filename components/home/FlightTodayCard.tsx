/**
 * Home on a travel day (day-of assistant, spec 2026-11-01): the next flight today — route, departure on the
 * airport's clock, gate and seat when known, leave-by (Pro) and Check in online — opening the boarding pass.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AirplaneTilt } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { flightClock } from '@/utils/airportTime';
import { flightCountdown, flightStatusLine } from '@/utils/dayOf';
import { CheckInButton } from '@/components/wallet/CheckInButton';
import type { BoardingPass } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const FlightTodayCard = memo(function FlightTodayCard({ pass }: { pass: BoardingPass }) {
  const { colors } = useTheme();
  const open = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(wallet)/boarding-pass/${pass.id}`); }, [pass.id]);
  const dep = flightClock(pass.departureTime, pass.origin);
  // The countdown moves on while the card is on screen (owner, 2026-11-08).
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const countdown = flightCountdown(pass, now);
  const status = flightStatusLine(pass as BoardingPass & { gateSource?: string });
  const details = [pass.terminal ? `Terminal ${pass.terminal}` : null, pass.gate ? `Gate ${pass.gate}` : null, pass.seat ? `Seat ${pass.seat}` : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.card, { backgroundColor: colors.background.card }]}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Flight ${pass.flightNumber} from ${pass.origin} to ${pass.destination} today. Open the boarding pass`} style={styles.top}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{`FLIGHT TODAY · ${pass.flightNumber}`}</Text>
        <View style={styles.route}>
          <Text style={[styles.code, { color: colors.text.primary }]}>{pass.origin}</Text>
          <AirplaneTilt size={22} color={colors.brand.purple} weight="duotone" />
          <Text style={[styles.code, { color: colors.text.primary }]}>{pass.destination}</Text>
          {dep ? <Text style={[styles.time, { color: colors.text.secondary }]}>{dep.time}</Text> : null}
        </View>
        {countdown ? <Text style={[styles.countdown, { color: colors.text.primary }]}>{countdown}</Text> : null}
        {status ? <Text style={[styles.status, { color: colors.text.primary }]}>{status}</Text> : null}
        {details ? <Text style={[styles.details, { color: colors.text.secondary }]}>{details}</Text> : null}
      </Pressable>
      <CheckInButton pass={pass} />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, padding: Spacing['5'], gap: Spacing['4'] },
  countdown: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, marginTop: Spacing['2'] },
  status: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, marginTop: 2 },
  top: { gap: Spacing['2'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  route: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  code: { fontSize: 30, fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  time: { marginLeft: 'auto', fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, fontVariant: ['tabular-nums'] },
  details: { fontSize: FontSize.base },
});
