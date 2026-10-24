import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { Spacing } from '@/constants/spacing';
import type { TravelerSuggestion } from '@/hooks/useTravelerSuggestions';

/** The last onboarding step (spec 2026-10-24-seed-social-design.md): a few travelers to follow, nothing forced. */
export function OnboardingFollowSlide({ active, suggestions }: { active: boolean; suggestions: TravelerSuggestion[] }) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled>
      <SlideTextBlock
        eyebrow="YOUR PEOPLE"
        title="Travelers to follow"
        body="Follow a few travelers to fill your feed with their trips."
        active={active}
      />
      <View style={styles.list}>
        {suggestions.map((s) => <UserSuggestion key={s.uid} user={s.profile} />)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing['6'], paddingTop: Spacing['8'], paddingBottom: Spacing['6'], gap: Spacing['5'], width: '100%', maxWidth: 560, alignSelf: 'center' },
  list: { gap: Spacing['3'] },
});
