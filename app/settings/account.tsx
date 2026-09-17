import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretLeft } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { Button } from '@/components/ui/Button';
import { deleteAccount } from '@/services/account';
import { presentCustomerCenter } from '@/services/revenuecatUI';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function AccountSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const tier = useAuthStore((s) => s.tier);
  const profile = useUserStore((s) => s.profile);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const runDelete = useCallback(async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // On success the auth listener routes to the welcome screen, unmounting this one.
      await deleteAccount();
    } catch {
      setIsDeleting(false);
      setDeleteError("We couldn't finish deleting your account. Check your connection and try again.");
    }
  }, []);

  const handleDeletePress = useCallback(() => {
    const hasSubscription = tier !== 'free';
    const body =
      "This permanently deletes your profile, posts, trips, wallet, and messages. You can't undo it.";

    Alert.alert(
      'Delete your account?',
      hasSubscription
        ? `${body}\n\nDeleting your account doesn't cancel Supernova Pro. Cancel it first, or you'll keep being charged.`
        : body,
      [
        { text: 'Cancel', style: 'cancel' },
        ...(hasSubscription
          ? [{ text: 'Manage subscription', onPress: () => { presentCustomerCenter(); } }]
          : []),
        { text: 'Delete account', style: 'destructive' as const, onPress: runDelete },
      ],
    );
  }, [tier, runDelete]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const capitalizedTier = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Free';

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={8} accessibilityLabel="Back">
          <CaretLeft size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Account</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing['8'] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>BASICS</Text>
        <View style={[styles.section, { borderColor: colors.background.cardBorder }]}>
          <SettingsRow label="Email" value={user?.email ?? 'Not set'} showDivider />
          <SettingsRow label="Full name" value={profile?.fullName ?? user?.displayName ?? 'Not set'} showDivider />
          <SettingsRow label="Username" value={profile?.username ? `@${profile.username}` : 'Not set'} showDivider />
          <SettingsRow label="Plan" value={capitalizedTier} showDivider={!!memberSince} />
          {memberSince ? <SettingsRow label="Member since" value={memberSince} /> : null}
        </View>

        <Text style={[styles.footnote, { color: colors.text.tertiary }]}>
          Edit your name, username, photo, and bio from your profile.
        </Text>

        <Text style={[styles.sectionHeader, styles.dangerHeader, { color: colors.text.tertiary }]}>
          DELETE ACCOUNT
        </Text>
        <Text style={[styles.dangerBody, { color: colors.text.secondary }]}>
          Permanently remove your account and everything in it. Other travelers will no longer see
          your profile, posts, or trips.
        </Text>
        <Button
          label="Delete account"
          variant="danger"
          size="md"
          fullWidth
          loading={isDeleting}
          disabled={isDeleting}
          onPress={handleDeletePress}
        />
        {deleteError ? (
          <Text
            style={[styles.dangerError, { color: colors.semantic.error }]}
            accessibilityLiveRegion="polite"
          >
            {deleteError}
          </Text>
        ) : null}
      </ScrollView>
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
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 1,
    marginTop: Spacing['4'],
    marginBottom: Spacing['2'],
  },
  section: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  footnote: {
    fontSize: FontSize.sm,
    marginTop: Spacing['4'],
    lineHeight: FontSize.sm * 1.5,
  },
  dangerHeader: {
    marginTop: Spacing['8'],
  },
  dangerBody: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    marginBottom: Spacing['3'],
  },
  dangerError: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    marginTop: Spacing['3'],
  },
});
