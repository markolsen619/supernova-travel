/**
 * A trip invite link opened in the app (spec 2026-10-30-trip-invite-links-design.md). Signed in: the invite and
 * Join trip, or with `?auto=1` (a new account claiming its waiting invite) the join itself. Signed out, or before
 * auth has settled: the token is kept (services/pendingInvite) and usePendingInviteClaim reopens it after sign-in —
 * on a cold start the auth listener's router.replace discards this screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { CheckCircle, LinkBreak, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { acceptInvite, previewInvite, type AcceptResult } from '@/services/inviteLinks';
import { clearPendingInvite, readPendingInvite, savePendingInvite } from '@/services/pendingInvite';
import { inviteErrorCopy } from '@/utils/inviteLinks';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

const NETWORK = new Set(['unavailable', 'deadline-exceeded', 'internal']);
const codeOf = (e: unknown) => String((e as { code?: string })?.code ?? '').replace(/^functions\//, '');

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function JoinTripScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { token = '', auto } = useLocalSearchParams<{ token?: string; auto?: string }>();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.isInitialized);
  const signedIn = initialized && !!user;

  const [joined, setJoined] = useState<AcceptResult | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<{ code: string } | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  // Not signed in (yet): keep the invite for after sign-up.
  useEffect(() => {
    if (!token) return;
    if (!initialized) { savePendingInvite(token); return; }
    if (!user) {
      savePendingInvite(token).then(() => router.replace('/(auth)/welcome'));
      return;
    }
    readPendingInvite().then((t) => { if (t === token) clearPendingInvite(); });
  }, [token, initialized, user]);

  const preview = useQuery({
    queryKey: ['invitePreview', token],
    queryFn: () => previewInvite(token),
    enabled: signedIn && !!token && auto !== '1',
    retry: false,
    staleTime: 0,
  });

  const join = useCallback(async () => {
    setJoining(true);
    setError(null);
    try {
      const r = await acceptInvite(token);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', r.tripId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJoined(r);
    } catch (e) {
      setError({ code: codeOf(e) });
    } finally {
      setJoining(false);
    }
  }, [token, queryClient]);

  const autoRan = useRef(false);
  useEffect(() => {
    if (signedIn && auto === '1' && token && !autoRan.current) { autoRan.current = true; join(); }
  }, [signedIn, auto, token, join]);

  const openTrip = useCallback((tripId: string) => {
    if (router.canDismiss()) router.dismissAll();
    router.push(`/trip/${tripId}`);
  }, []);

  const p = preview.data;
  const inviterFirst = p && p.status !== 'member' ? p.inviterFirst : joined?.inviterFirst ?? null;
  const ready = signedIn && (joined || error || (auto !== '1' && (p || preview.isError)));
  useEffect(() => {
    if (ready) Animated.spring(fade, { toValue: 1, ...SPRING, useNativeDriver: true }).start();
  }, [ready, fade]);

  let body: React.ReactNode;
  if (!ready) {
    body = <ActivityIndicator color={colors.text.tertiary} style={styles.spinner} />;
  } else if (joined) {
    body = (
      <EmptyState
        icon={CheckCircle}
        title={joined.status === 'member' ? "You're already on this trip" : `You joined ${joined.inviterFirst}'s trip`}
        description={joined.tripTitle}
        actionLabel="Open trip"
        onAction={() => openTrip(joined.tripId)}
        actionHaptic="light"
      />
    );
  } else if (error && NETWORK.has(error.code)) {
    body = (
      <EmptyState icon={LinkBreak} title={inviteErrorCopy(error.code, inviterFirst)} actionLabel="Try again" onAction={join} actionHaptic="light" />
    );
  } else if (error || preview.isError || p?.status === 'expired') {
    body = (
      <EmptyState
        icon={LinkBreak}
        title={inviteErrorCopy(error?.code ?? 'failed-precondition', inviterFirst)}
        description="Invite links work once and last 30 days."
        actionLabel="Go home"
        onAction={leave}
        actionHaptic="light"
      />
    );
  } else if (p?.status === 'member') {
    body = (
      <EmptyState icon={CheckCircle} title="You're already on this trip" actionLabel="Open trip" onAction={() => openTrip(p.tripId)} actionHaptic="light" />
    );
  } else if (p?.status === 'open') {
    body = (
      <View style={styles.invite}>
        <View style={[styles.cover, { backgroundColor: colors.background.sunken }]}>
          {p.coverUrl ? <Image source={{ uri: p.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        </View>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{p.dates ?? 'TRIP INVITE'}</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>{`${p.inviterFirst} invited you to ${p.tripTitle}`}</Text>
        <Text style={[styles.lede, { color: colors.text.secondary }]}>
          Join the trip to plan it together: stops, packing and bookings in one place.
        </Text>
        <Button label="Join trip" onPress={join} loading={joining} fullWidth style={styles.cta} />
        <Pressable onPress={leave} style={styles.notNow} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.notNowText, { color: colors.text.secondary }]}>Not now</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background.primary, paddingTop: insets.top > 20 ? Spacing['3'] : insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={leave} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <X size={20} weight="bold" color={colors.text.secondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['8'] }]}>
        <Animated.View style={{ opacity: ready ? fade : 1 }}>{body}</Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing['3'] },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing['5'], flexGrow: 1 },
  spinner: { marginTop: Spacing['16'] },
  invite: { paddingTop: Spacing['2'] },
  cover: { width: '100%', aspectRatio: 4 / 3, borderRadius: 20, overflow: 'hidden' },
  eyebrow: { marginTop: Spacing['5'], fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { marginTop: Spacing['2'], fontSize: 28, lineHeight: 32, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  lede: { marginTop: Spacing['2'], fontSize: FontSize.base, lineHeight: 22 },
  cta: { marginTop: Spacing['8'] },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing['2'] },
  notNowText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
});
