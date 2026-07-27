import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { StarMark } from '@/components/ui/StarMark';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { OnboardingAvatar } from '@/hooks/useOnboardingContent';
import { Spacing } from '@/constants/spacing';

interface OnboardingCommunitySlideProps {
  avatars: OnboardingAvatar[];
  active: boolean;
  scrollX: Animated.Value;
  index: number;
}

export function OnboardingCommunitySlide({
  avatars,
  active,
  scrollX,
  index,
}: OnboardingCommunitySlideProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active || reduceMotion) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 9000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 9000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, scale]);

  // Same swipe-parallax contract as OnboardingPhotoSlide (Task 6) — composed
  // with the grid's own drift scale as a second transform entry.
  const parallaxScale = scrollX.interpolate({
    inputRange: [(index - 1) * width, index * width, (index + 1) * width],
    outputRange: [1.05, 1, 1.05],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.gridRegion}>
        {avatars.length > 0 ? (
          <Animated.View style={[styles.grid, { transform: [{ scale }, { scale: parallaxScale }] }]}>
            {avatars.map((a) => (
              <Avatar key={a.uid} uri={a.avatarUrl} name={a.name} size="xl" style={styles.gridAvatar} />
            ))}
          </Animated.View>
        ) : (
          // Branded fallback when the suggestions query is empty (e.g. a
          // freshly-seeded database with no other users yet).
          <StarMark size={40} />
        )}
      </View>
      <View style={styles.textRegion}>
        <SlideTextBlock
          eyebrow="Community"
          title="Travel together"
          body="Follow other explorers, share your trips, and get inspired by the community."
          active={active}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  gridRegion: { height: '55%', alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing['4'],
    paddingHorizontal: Spacing['8'],
  },
  gridAvatar: { margin: Spacing['1'] },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
