import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AirplaneTilt, BellSimpleRinging, ChatCircleDots, EnvelopeSimple, UsersThree } from 'phosphor-react-native';
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
import { markPushIntroShown, requestPushNow } from '@/services/push';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const REASONS: { Icon: PhosphorIcon; title: string; body: string }[] = [
  { Icon: AirplaneTilt, title: 'Flight changes', body: 'Gate changes, delays and boarding, as they happen (Pro).' },
  { Icon: UsersThree, title: 'Trips with friends', body: 'Invites, and who joined your trip.' },
  { Icon: ChatCircleDots, title: 'Messages', body: 'When someone writes to you.' },
  { Icon: EnvelopeSimple, title: 'Your wallet', body: 'Bookings and balances added from your email (Pro).' },
];

/**
 * "Know when it matters" — shown once after sign-up (and once to existing
 * accounts iOS never asked; hooks/usePushIntro). "Turn on" shows the iOS
 * sheet; "Not now" leaves it unspent for a later, in-context ask.
 */
export default function NotificationIntroScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  const turnOn = useCallback(async () => {
    if (!uid) return close();
    setBusy(true);
    await markPushIntroShown(uid);
    await requestPushNow(uid);
    setBusy(false);
    close();
  }, [uid, close]);

  const notNow = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (uid) await markPushIntroShown(uid);
    close();
  }, [uid, close]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary, paddingBottom: insets.bottom + Spacing['4'] }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BellSimpleRinging size={40} color={colors.text.primary} weight="duotone" />
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>NOTIFICATIONS</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>Know when it matters</Text>
        <Text style={[styles.lede, { color: colors.text.secondary }]}>
          Supernova only notifies you about your own trips and the people you travel with.
        </Text>
        <View style={styles.reasons}>
          {REASONS.map(({ Icon, title, body }) => (
            <View key={title} style={styles.reason}>
              <View style={[styles.bubble, { backgroundColor: colors.background.sunken }]}>
                <Icon size={20} color={colors.text.primary} weight="duotone" />
              </View>
              <View style={styles.reasonText}>
                <Text style={[styles.reasonTitle, { color: colors.text.primary }]}>{title}</Text>
                <Text style={[styles.reasonBody, { color: colors.text.secondary }]}>{body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Turn on notifications" onPress={turnOn} loading={busy} haptic="medium" />
        <TouchableOpacity onPress={notNow} style={styles.notNow} accessibilityRole="button" disabled={busy}>
          <Text style={[styles.notNowText, { color: colors.text.secondary }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['8'], gap: Spacing['2'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginTop: Spacing['4'] },
  title: { fontSize: 28, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  lede: { fontSize: 15, lineHeight: 22, marginTop: Spacing['1'] },
  reasons: { marginTop: Spacing['6'], gap: Spacing['5'] },
  reason: { flexDirection: 'row', gap: Spacing['3'], alignItems: 'flex-start' },
  bubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  reasonText: { flex: 1, gap: 2 },
  reasonTitle: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  reasonBody: { fontSize: 14, lineHeight: 20 },
  actions: { paddingHorizontal: Spacing['5'], gap: Spacing['2'] },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notNowText: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
});
