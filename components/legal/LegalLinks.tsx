import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/legal';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface LegalLinksProps {
  /**
   * Text colour. Passed in rather than read from useTheme() because the welcome
   * screen is pinned dark while the paywall follows the theme.
   */
  color: string;
}

/**
 * "Terms of use · Privacy policy" as two real tap targets, not inline links
 * inside a sentence — inline links in 12pt copy can't reach the 44pt minimum.
 * Opens in an in-app browser so the user lands back where they were.
 */
export function LegalLinks({ color }: LegalLinksProps) {
  const openTerms = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    WebBrowser.openBrowserAsync(TERMS_OF_USE_URL);
  }, []);

  const openPrivacy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
  }, []);

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={openTerms} style={styles.link} accessibilityRole="link">
        <Text style={[styles.label, { color }]}>Terms of use</Text>
      </TouchableOpacity>
      <Text style={[styles.separator, { color }]} importantForAccessibility="no">
        ·
      </Text>
      <TouchableOpacity onPress={openPrivacy} style={styles.link} accessibilityRole="link">
        <Text style={[styles.label, { color }]}>Privacy policy</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing['2'],
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textDecorationLine: 'underline',
  },
  separator: {
    fontSize: FontSize.xs,
  },
});
