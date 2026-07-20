import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X, UserCircle, LockSimple, Sparkle } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore, ThemeMode } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { auth } from '@/services/firebase';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useThemeStore();
  const tier = useAuthStore((s) => s.tier);

  const capitalizedTier = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Free';

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleThemeSelect = useCallback((value: ThemeMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(value);
  }, [setMode]);

  const handleSignOut = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Sign out?', "You'll need to sign in again to get back to your trips.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => auth.signOut() },
    ]);
  }, []);

  const sectionStyle = [styles.section, { borderColor: colors.background.cardBorder }];

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Settings</Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={8} accessibilityLabel="Close">
          <X size={20} color={colors.text.secondary} weight="bold" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing['8'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Appearance */}
        <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>APPEARANCE</Text>
        <View style={sectionStyle}>
          <SettingsRow
            label="Theme"
            accessory={
              <View style={[styles.segmentedControl, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
                {THEME_OPTIONS.map((option) => {
                  const isActive = mode === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => handleThemeSelect(option.value)}
                      style={[styles.segmentOption, isActive && { backgroundColor: colors.brand.purple }]}
                      accessibilityLabel={`${option.label} theme`}
                    >
                      <Text style={[styles.segmentText, { color: isActive ? colors.text.inverse : colors.text.tertiary }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            }
          />
        </View>

        {/* Account */}
        <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>ACCOUNT</Text>
        <View style={sectionStyle}>
          <SettingsRow
            label="Account"
            icon={UserCircle}
            onPress={() => router.push('/settings/account')}
            showDivider
          />
          <SettingsRow
            label="Privacy"
            icon={LockSimple}
            onPress={() => router.push('/settings/privacy')}
            showDivider
          />
          <SettingsRow
            label="Subscription"
            icon={Sparkle}
            value={capitalizedTier}
            onPress={tier === 'free' ? () => router.push('/paywall') : undefined}
          />
        </View>

        {/* About */}
        <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>ABOUT</Text>
        <View style={sectionStyle}>
          <SettingsRow label="Version" value="1.0.0" />
        </View>

        {/* Sign out */}
        <View style={styles.signOutSection}>
          <Button
            label="Sign out"
            variant="danger"
            size="lg"
            fullWidth
            onPress={handleSignOut}
            haptic="none"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['4'],
    position: 'relative',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  closeButton: {
    position: 'absolute',
    right: Spacing['5'],
    bottom: Spacing['4'],
    padding: Spacing['2'],
  },
  scrollContent: {
    paddingHorizontal: Spacing['5'],
  },
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 1,
    marginTop: Spacing['6'],
    marginBottom: Spacing['2'],
  },
  section: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 2,
  },
  segmentOption: {
    paddingVertical: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  signOutSection: {
    marginTop: Spacing['8'],
  },
});
