/** Home's sticky header (spec 2026-10-29): the splash star + wordmark, Wallet, Inbox with one badge. */
import { memo, useCallback } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Bell, Star, Wallet } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTheme } from '@/hooks/useTheme';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { badgeLabel, inboxTab, showGetPro } from '@/utils/inboxBadge';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export const HomeHeader = memo(function HomeHeader({ topInset }: { topInset: number }) {
  const { colors } = useTheme();
  const badge = useInboxBadge();
  const label = badgeLabel(badge.total);
  // Free accounts only, and only once the saved tier agrees (it starts as 'free' before it loads).
  const tier = useAuthStore((s) => s.tier);
  const serverTier = useAuthStore((s) => s.serverTier);
  const getPro = showGetPro(tier) && showGetPro(serverTier);
  const openPro = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/paywall'); }, []);
  const wallet = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(wallet)'); }, []);
  const inbox = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: '/notifications', params: { tab: inboxTab(badge.messages) } }); }, [badge.messages]);
  return (
    <View style={[styles.bar, { paddingTop: topInset + Spacing['2'], backgroundColor: colors.background.primary, borderBottomColor: colors.background.cardBorder }]}>
      <View style={styles.logo} accessible accessibilityLabel="Supernova">
        <Image source={require('@/assets/images/SupernovaStar.png')} style={styles.star} resizeMode="contain" />
        <Text style={[styles.word, { color: colors.text.primary }]}>Supernova</Text>
      </View>
      <View style={styles.buttons}>
        {getPro ? (
          <Pressable onPress={openPro} hitSlop={4} accessibilityRole="button" accessibilityLabel="Get Supernova Pro">
            <LinearGradient colors={colors.gradient.purplePink} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pro}>
              <Star size={14} color="#fff" weight="fill" />
              <Text style={styles.proText}>Get Pro</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
        <Pressable onPress={wallet} style={[styles.btn, { backgroundColor: colors.background.card }]} accessibilityRole="button" accessibilityLabel="Wallet">
          <Wallet size={20} color={colors.text.primary} />
        </Pressable>
        <Pressable onPress={inbox} style={[styles.btn, { backgroundColor: colors.background.card }]} accessibilityRole="button" accessibilityLabel={label ? `Inbox, ${label} unread` : 'Inbox'}>
          <Bell size={20} color={colors.text.primary} />
          {label && <View style={[styles.badge, { backgroundColor: colors.brand.pink }]}><Text style={styles.badgeText}>{label}</Text></View>}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing['5'], paddingBottom: Spacing['2'], borderBottomWidth: StyleSheet.hairlineWidth },
  logo: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  star: { width: 28, height: 28 },
  word: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, letterSpacing: -0.3 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  pro: { height: 40, borderRadius: 20, paddingHorizontal: Spacing['3'], flexDirection: 'row', alignItems: 'center', gap: 6 },
  proText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },
});
