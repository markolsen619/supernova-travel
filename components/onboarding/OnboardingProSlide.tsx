import { useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Animated, useWindowDimensions } from 'react-native';
import { PaywallFeatureList } from '@/components/paywall/PaywallFeatureList';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/motion';

interface OnboardingProSlideProps {
  active: boolean;
}

// No hero photo/component region — the feature list itself is the content,
// so it gets the space a photo would otherwise occupy. See the spec's
// Visual System section.
export function OnboardingProSlide({ active }: OnboardingProSlideProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  // The only slide with no photo and no avatar grid, so it has no other
  // motion source — without this the feature list simply snaps into place
  // while every neighbouring slide breathes.
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    if (!active) {
      opacity.setValue(0);
      translateY.setValue(12);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: Duration.slow, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: Duration.slow, useNativeDriver: true }),
    ]).start();
  }, [active, reduceMotion, opacity, translateY]);

  return (
    <View style={[styles.slide, { width }]}>
      {/* flexGrow + justifyContent centres the block when it fits and falls
          back to ordinary top-down scrolling when it doesn't — the feature
          list has no fixed height, and larger accessibility text sizes must
          still be reachable. */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
          <SlideTextBlock
            eyebrow="Supernova Pro"
            title="Go further with Pro"
            body="Unlock unlimited AI trips, flight alerts, and more — upgrade any time."
            active={active}
          />
          {/* Horizontal padding lives here only — SlideTextBlock brings its
              own, and padding scrollContent too would misalign the copy
              against every other slide. */}
          <View style={styles.listWrap}>
            <PaywallFeatureList />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing['8'] },
  listWrap: { paddingHorizontal: Spacing['6'], paddingTop: Spacing['6'] },
});
