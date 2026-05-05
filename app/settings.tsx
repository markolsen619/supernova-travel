import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore, ThemeMode } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
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
  const { user, tier } = useAuthStore((s) => ({ user: s.user, tier: s.tier }));

  const capitalizedTier = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Free';

  return (
    <LinearGradient
      colors={colors.gradient.dark}
      style={styles.gradient}
    >
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Settings
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: colors.text.secondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing['8'] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Appearance Section */}
          <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>
            APPEARANCE
          </Text>
          <View style={[styles.section, { borderColor: colors.background.cardBorder }]}>
            <View style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}>
              <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Theme</Text>
              <View style={[styles.segmentedControl, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
                {THEME_OPTIONS.map((option) => {
                  const isActive = mode === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => setMode(option.value)}
                      style={[
                        styles.segmentOption,
                        isActive && { backgroundColor: colors.brand.purple },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          { color: isActive ? '#ffffff' : colors.text.tertiary },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Account Section */}
          <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>
            ACCOUNT
          </Text>
          <View style={[styles.section, { borderColor: colors.background.cardBorder }]}>
            <View style={[styles.row, { borderBottomColor: colors.background.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Display Name</Text>
              <Text style={[styles.rowValue, { color: colors.text.secondary }]}>
                {user?.displayName ?? 'Not set'}
              </Text>
            </View>
            <View style={[styles.row, { borderBottomColor: colors.background.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Email</Text>
              <Text style={[styles.rowValue, { color: colors.text.secondary }]}>
                {user?.email ?? ''}
              </Text>
            </View>
            <View style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}>
              <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Subscription</Text>
              <View style={styles.subscriptionRow}>
                <Text style={[styles.rowValue, { color: colors.text.secondary }]}>
                  {capitalizedTier}
                </Text>
                {tier === 'free' && (
                  <TouchableOpacity onPress={() => router.push('/paywall')}>
                    <Text style={[styles.upgradeText, { color: colors.brand.purple }]}>
                      {' '}Upgrade →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* About Section */}
          <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>
            ABOUT
          </Text>
          <View style={[styles.section, { borderColor: colors.background.cardBorder }]}>
            <View style={[styles.row, { borderBottomColor: colors.background.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Version</Text>
              <Text style={[styles.rowValue, { color: colors.text.secondary }]}>1.0.0</Text>
            </View>
            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.background.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Privacy Policy</Text>
              <Text style={[styles.rowValue, { color: colors.text.secondary }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}>
              <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Terms of Service</Text>
              <Text style={[styles.rowValue, { color: colors.text.secondary }]}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Danger Zone Section */}
          <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>
            DANGER ZONE
          </Text>
          <View style={styles.dangerSection}>
            <Button
              label="Sign Out"
              variant="danger"
              size="lg"
              fullWidth
              onPress={() => auth.signOut()}
            />
          </View>
        </ScrollView>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
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
    fontWeight: FontWeight.bold,
  },
  closeButton: {
    position: 'absolute',
    right: Spacing['5'],
    top: undefined,
    bottom: Spacing['4'],
    padding: Spacing['2'],
  },
  closeText: {
    fontSize: FontSize.md,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
  },
  rowLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  rowValue: {
    fontSize: FontSize.base,
    flexShrink: 1,
    textAlign: 'right',
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
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
  dangerSection: {
    marginTop: Spacing['2'],
  },
});
