import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useUserStore } from '@/stores/useUserStore';
import { isPrivateAccount } from '@/utils/privacy';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretLeft, GlobeHemisphereWest, LockSimple, EyeSlash, Prohibit, Sparkle, LockKey } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useModerationStore } from '@/stores/useModerationStore';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAiConsentStore } from '@/stores/useAiConsentStore';
import { useAiConsentGate } from '@/components/ai/useAiConsentGate';
import { withdrawAiConsent } from '@/services/aiConsent';
import { hasAiConsent } from '@/utils/aiConsent';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const PRIVACY_POINTS = [
  {
    Icon: GlobeHemisphereWest,
    title: 'Public by default',
    body: 'Your profile and public trips are visible to other travelers. Set a trip to followers-only or private from its edit screen.',
  },
  {
    Icon: LockSimple,
    title: 'Your wallet stays yours',
    body: 'Boarding passes, reservations, and loyalty programs are visible only to you — never on your public profile.',
  },
  {
    Icon: EyeSlash,
    title: 'Saved trips are private',
    body: 'Trips you save are only visible to you.',
  },
];

export default function PrivacySettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const blockedCount = useModerationStore((s) => s.blockedUids.length);
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const aiAllowed = useAiConsentStore((s) => hasAiConsent(s.version));
  const { requireConsent, consentSheet } = useAiConsentGate();

  // SettingsRow fires its own haptic.
  const handleAiPress = useCallback(() => {
    if (!aiAllowed) {
      requireConsent('trip', () => {});
      return;
    }
    Alert.alert(
      'Turn off AI data sharing?',
      'AI trip planning and booking import will ask for permission again before sending anything to Google.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: () => {
            withdrawAiConsent(uid).catch(() =>
              Alert.alert("We couldn't turn it off", 'Check your connection and try again.'),
            );
          },
        },
      ],
    );
  }, [aiAllowed, requireConsent, uid]);

  // ── Private account ──
  const profile = useUserStore((s) => s.profile);
  const [isPrivate, setIsPrivate] = useState(isPrivateAccount(profile));
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const setPrivacy = useCallback(async (next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPrivate(next); // optimistic
    setSavingPrivacy(true);
    try {
      await updateDoc(doc(db, 'users', uid), { 'settings.privacy': next ? 'private' : 'public' });
      const current = useUserStore.getState().profile;
      if (current) useUserStore.getState().setProfile({ ...current, settings: { ...current.settings, privacy: next ? 'private' : 'public' } });
    } catch {
      setIsPrivate(!next);
      Alert.alert("We couldn't change that", 'Check your connection and try again.');
    } finally {
      setSavingPrivacy(false);
    }
  }, [uid]);
  const handlePrivateToggle = useCallback((next: boolean) => {
    Alert.alert(
      next ? 'Make your account private?' : 'Make your account public?',
      next
        ? 'New followers will need your approval. Your public trips and posts become visible to followers only. People who already follow you keep following.'
        : 'Anyone can follow you and see your public trips and posts again. Everyone waiting to follow you will be approved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: next ? 'Make private' : 'Make public', onPress: () => { setPrivacy(next); } },
      ],
    );
  }, [setPrivacy]);

  // SettingsRow fires its own haptic.
  const handleBlockedPress = useCallback(() => {
    router.push('/settings/blocked');
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={8} accessibilityLabel="Back">
          <CaretLeft size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Privacy</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing['8'] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.lede, { color: colors.text.secondary }]}>
          How your travels are shared on Supernova.
        </Text>

        {PRIVACY_POINTS.map(({ Icon, title, body }, i) => (
          <View
            key={title}
            style={[
              styles.card,
              { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
              i > 0 && { marginTop: Spacing['3'] },
            ]}
          >
            <View style={[styles.iconBubble, { backgroundColor: `${colors.brand.purple}1A` }]}>
              <Icon size={20} color={colors.brand.purple} weight="duotone" />
            </View>
            <View style={styles.cardTexts}>
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{title}</Text>
              <Text style={[styles.cardBody, { color: colors.text.secondary }]}>{body}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.section, { borderColor: colors.background.cardBorder }]}>
          <SettingsRow
            label="Private account"
            icon={LockKey}
            accessory={
              <Switch
                value={isPrivate}
                onValueChange={handlePrivateToggle}
                disabled={savingPrivacy}
                trackColor={{ true: colors.brand.purple, false: colors.background.sunken }}
                accessibilityLabel="Private account"
              />
            }
            showDivider
          />
          <SettingsRow
            label="Blocked accounts"
            icon={Prohibit}
            value={blockedCount > 0 ? String(blockedCount) : undefined}
            onPress={handleBlockedPress}
            showDivider
          />
          <SettingsRow
            label="AI data sharing"
            icon={Sparkle}
            value={aiAllowed ? 'Allowed' : 'Off'}
            onPress={handleAiPress}
          />
        </View>

        <Text style={[styles.footnote, { color: colors.text.tertiary }]}>
          A private account shows people who don't follow you only your photo, name and bio, and they ask to follow you. Change who can see a trip from its edit screen. To report something, tap the three dots on it. AI data sharing sends what you enter in AI features to Google Gemini.
        </Text>
      </ScrollView>
      {consentSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['4'],
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing['5'],
  },
  lede: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
    marginTop: Spacing['2'],
    marginBottom: Spacing['5'],
  },
  card: {
    flexDirection: 'row',
    gap: Spacing['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTexts: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  cardBody: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
  },
  section: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing['5'],
  },
  footnote: {
    fontSize: FontSize.xs,
    marginTop: Spacing['5'],
    lineHeight: FontSize.xs * 1.6,
  },
});
