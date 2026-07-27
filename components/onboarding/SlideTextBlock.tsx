import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight, LetterSpacing, LineHeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface SlideTextBlockProps {
  eyebrow: string;
  title: string;
  body: string;
  active: boolean;
}

function useRiseIn(active: boolean, delayMs: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (!active) {
      opacity.setValue(0);
      translateY.setValue(10);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delayMs),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [active, delayMs, opacity, translateY]);

  return { opacity, transform: [{ translateY }] };
}

// Eyebrow -> title -> body stagger, same rise-and-fade shape
// app/(auth)/welcome.tsx already uses for its logo/tagline/actions sequence
// — the whole auth flow reads as one motion language.
export function SlideTextBlock({ eyebrow, title, body, active }: SlideTextBlockProps) {
  const { colors } = useTheme();
  const eyebrowAnim = useRiseIn(active, 150);
  const titleAnim = useRiseIn(active, 280);
  const bodyAnim = useRiseIn(active, 400);

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.eyebrow,
          { color: colors.text.tertiary, opacity: eyebrowAnim.opacity, transform: eyebrowAnim.transform },
        ]}
      >
        {eyebrow}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.title,
          { color: colors.text.primary, opacity: titleAnim.opacity, transform: titleAnim.transform },
        ]}
      >
        {title}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.body,
          { color: colors.text.secondary, opacity: bodyAnim.opacity, transform: bodyAnim.transform },
        ]}
      >
        {body}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing['6'] },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: LetterSpacing.wider,
    textTransform: 'uppercase',
    marginBottom: Spacing['2'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Spacing['3'],
    lineHeight: FontSize['2xl'] * LineHeight.tight,
  },
  body: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * LineHeight.normal,
  },
});
