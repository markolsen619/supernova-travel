import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { TAB_BAR_HEIGHT } from '@/constants/layout';
import { Spacing } from '@/constants/spacing';
import { FontWeight } from '@/constants/typography';
import type { TravelerSuggestion } from '@/hooks/useTravelerSuggestions';
import { suggestionMeta } from '@/utils/travelerSuggestions';

/** "Travelers to follow" as a feed page, shown while you follow fewer than three people (utils/travelerSuggestions). */
export function TravelerSuggestionsPage({ suggestions, width, height }: { suggestions: TravelerSuggestion[]; width: number; height: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ width, height, backgroundColor: colors.background.primary }}>
      {/* A plain View, not a ScrollView: a vertical scroller inside the vertically paged feed took the swipe on iOS
          and trapped people on this page (final review). Six rows fit on any phone. */}
      <View style={[styles.content, { paddingTop: insets.top + 72, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing['6'] }]}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>YOUR PEOPLE</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>Travelers to follow</Text>
        <Text style={[styles.lede, { color: colors.text.secondary }]}>Follow a few travelers to fill your feed with their trips.</Text>
        <View style={styles.list}>
          {suggestions.map((s) => <UserSuggestion key={s.uid} user={s.profile} meta={suggestionMeta(s)} />)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing['5'], gap: Spacing['2'], flexGrow: 1, justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: 28, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  lede: { fontSize: 15, lineHeight: 22 },
  list: { marginTop: Spacing['5'], gap: Spacing['3'] },
});
