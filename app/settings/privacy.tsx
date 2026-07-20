import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretLeft, GlobeHemisphereWest, LockSimple, EyeSlash } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
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

        <Text style={[styles.footnote, { color: colors.text.tertiary }]}>
          Granular privacy controls are on the way — per-trip visibility already works from each trip&apos;s edit screen.
        </Text>
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
  footnote: {
    fontSize: FontSize.xs,
    marginTop: Spacing['5'],
    lineHeight: FontSize.xs * 1.6,
  },
});
