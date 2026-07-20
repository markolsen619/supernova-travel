import { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { Link } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { StarField } from '@/components/animations/StarField';
import { DarkColors } from '@/constants/colors';
import { FontSize, LetterSpacing } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const logoOpacity     = useRef(new Animated.Value(0)).current;
  const logoTranslateY  = useRef(new Animated.Value(10)).current;
  const taglineOpacity  = useRef(new Animated.Value(0)).current;
  const actionsOpacity  = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(logoOpacity,    { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoTranslateY, { toValue: 0, ...SPRING }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(650),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(850),
      Animated.parallel([
        Animated.timing(actionsOpacity,     { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(actionsTranslateY,  { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Same starfield as the splash — the handoff reads as one continuous sky */}
      <StarField starCount={70} />

      {/* Hero — logo + tagline */}
      <View style={styles.hero}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ translateY: logoTranslateY }] }}>
          <Image
            source={require('@/assets/images/SupernovaLogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          Travel further.
        </Animated.Text>
      </View>

      {/* CTA buttons — colors={DarkColors} pins these to the splash's palette;
          without it, Button's own useTheme() would follow the user's
          light/dark app setting instead of staying dark on this immersive
          screen (the same bug class fixed for search.tsx's result rows). */}
      <Animated.View style={[styles.actions, { opacity: actionsOpacity, transform: [{ translateY: actionsTranslateY }] }]}>
        <Link href="/(auth)/sign-up" asChild>
          <Button label="Get started" variant="primary" size="lg" fullWidth haptic="light" colors={DarkColors} />
        </Link>
        <View style={styles.spacer} />
        <Link href="/(auth)/sign-in" asChild>
          <Button label="Sign in" variant="ghost" size="lg" fullWidth haptic="light" colors={DarkColors} />
        </Link>
      </Animated.View>

      <Text style={styles.terms}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DarkColors.background.primary,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
  },
  logo: {
    width: width * 0.975,
    height: 180,
    marginBottom: Spacing['4'],
  },
  tagline: {
    fontSize: FontSize.lg,
    color: DarkColors.text.secondary,
    textAlign: 'center',
    letterSpacing: LetterSpacing.wider,
  },
  actions: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['6'],
  },
  spacer: { height: Spacing['3'] },
  terms: {
    fontSize: FontSize.xs,
    color: DarkColors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['8'],
    lineHeight: 16,
  },
});
