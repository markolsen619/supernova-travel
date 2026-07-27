import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { PaywallFeatureList } from '@/components/paywall/PaywallFeatureList';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { Spacing } from '@/constants/spacing';

interface OnboardingProSlideProps {
  active: boolean;
}

// No hero photo/component region — the feature list itself is the content,
// so it gets the space a photo would otherwise occupy. See the spec's
// Visual System section.
export function OnboardingProSlide({ active }: OnboardingProSlideProps) {
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.header}>
        <SlideTextBlock
          eyebrow="Supernova Pro"
          title="Go further with Pro"
          body="Unlock unlimited AI trips, flight alerts, and more — upgrade any time."
          active={active}
        />
      </View>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <PaywallFeatureList />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  header: { paddingTop: Spacing['8'] },
  listContent: { paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'] },
});
