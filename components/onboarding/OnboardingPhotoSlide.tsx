import { Animated, View, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/constants/spacing';
import { KenBurnsImage } from '@/components/onboarding/KenBurnsImage';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';

interface OnboardingPhotoSlideProps {
  imageUrl: string | null;
  eyebrow: string;
  title: string;
  body: string;
  active: boolean;
  scrollX: Animated.Value;
  index: number;
}

// Layout A from the design-phase visual comparison: photo fills the top
// ~60%, fades to canvas via a scrim, text + CTA sit on light ground below.
export function OnboardingPhotoSlide({
  imageUrl,
  eyebrow,
  title,
  body,
  active,
  scrollX,
  index,
}: OnboardingPhotoSlideProps) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  // Swipe parallax: the incoming photo scales in from 1.05 -> 1.0 as it
  // reaches the centered position, rather than snapping to final scale —
  // see the spec's Motion System.
  const parallaxScale = scrollX.interpolate({
    inputRange: [(index - 1) * width, index * width, (index + 1) * width],
    outputRange: [1.05, 1, 1.05],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.photoRegion}>
        <KenBurnsImage
          uri={imageUrl}
          active={active}
          style={StyleSheet.absoluteFillObject}
          parallaxScale={parallaxScale}
        />
        <LinearGradient
          colors={['transparent', colors.background.primary] as [string, string]}
          style={styles.scrim}
        />
      </View>
      <View style={styles.textRegion}>
        <SlideTextBlock eyebrow={eyebrow} title={title} body={body} active={active} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  photoRegion: { height: '60%', width: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
