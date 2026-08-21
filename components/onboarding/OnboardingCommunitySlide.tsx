import { useEffect, useMemo } from 'react';
import { View, Image, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useSwipeParallax } from '@/hooks/useSwipeParallax';
import { useTheme } from '@/hooks/useTheme';
import { OnboardingAvatar } from '@/hooks/useOnboardingContent';
import { Spacing } from '@/constants/spacing';

// Bundled stand-ins for an empty suggestions query. A brand-new install has
// no other users to show, and that is exactly when onboarding is seen — so
// this path is the common one at launch, not a rare edge case. Rendered with
// a plain Image rather than through `Avatar`, which is used app-wide and
// deliberately only accepts a remote `uri` string.
const PLACEHOLDER_AVATARS = [
  require('@/assets/onboarding/community-1.png'),
  require('@/assets/onboarding/community-2.png'),
  require('@/assets/onboarding/community-3.png'),
  require('@/assets/onboarding/community-4.png'),
];

const AVATAR_PX = 96;
const DRIFT_STAGGER_MS = 120;

interface OnboardingCommunitySlideProps {
  avatars: OnboardingAvatar[];
  active: boolean;
  scrollX: Animated.Value;
  index: number;
}

/**
 * Per-cell drift values. One shared Animated.Value across the whole grid
 * moves every avatar in lockstep, which reads as a single image scaling
 * rather than a lively group — so each cell gets its own value and an
 * index-based delay before the identical loop.
 */
function useStaggeredDrift(count: number, active: boolean, reduceMotion: boolean) {
  const values = useMemo(
    () => Array.from({ length: count }, () => new Animated.Value(1)),
    [count]
  );

  useEffect(() => {
    if (!active || reduceMotion) {
      values.forEach((v) => v.setValue(1));
      return;
    }
    const loops = values.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * DRIFT_STAGGER_MS),
          Animated.timing(value, { toValue: 1.06, duration: 9000, useNativeDriver: true }),
          Animated.timing(value, { toValue: 1, duration: 9000, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, reduceMotion, values]);

  return values;
}

export function OnboardingCommunitySlide({
  avatars,
  active,
  scrollX,
  index,
}: OnboardingCommunitySlideProps) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  const hasAvatars = avatars.length > 0;
  const cellCount = hasAvatars ? avatars.length : PLACEHOLDER_AVATARS.length;
  const drift = useStaggeredDrift(cellCount, active, reduceMotion);

  // Same swipe-parallax contract as OnboardingPhotoSlide — applied to the
  // grid container, while the per-cell drift lives on each cell. Reduce-
  // motion gated inside the hook; `undefined` means omit the transform
  // entry entirely rather than passing `{ scale: undefined }`.
  const parallaxScale = useSwipeParallax(scrollX, index, width);
  const gridTransform = parallaxScale ? [{ scale: parallaxScale }] : undefined;

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.gridRegion}>
        <Animated.View
          style={[styles.grid, gridTransform ? { transform: gridTransform } : null]}
        >
          {hasAvatars
            ? avatars.map((a, i) => (
                <Animated.View
                  key={a.uid}
                  style={[styles.gridAvatar, { transform: [{ scale: drift[i] }] }]}
                >
                  <Avatar uri={a.avatarUrl} name={a.name} size="xl" />
                </Animated.View>
              ))
            : PLACEHOLDER_AVATARS.map((source, i) => (
                <Animated.View
                  key={i}
                  style={[styles.gridAvatar, { transform: [{ scale: drift[i] }] }]}
                >
                  <Image
                    source={source}
                    style={[
                      styles.placeholderCircle,
                      { borderColor: colors.background.cardBorder },
                    ]}
                  />
                </Animated.View>
              ))}
        </Animated.View>
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
  // Mirrors Avatar's xl treatment so the placeholder grid and the real grid
  // are structurally identical — only the imagery differs.
  placeholderCircle: {
    width: AVATAR_PX,
    height: AVATAR_PX,
    borderRadius: AVATAR_PX / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
