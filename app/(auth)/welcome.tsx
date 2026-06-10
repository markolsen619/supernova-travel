import { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { DarkColors } from '@/constants/colors';
import { FontSize, LetterSpacing } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const { width } = Dimensions.get('window');

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

const STAR_COUNT = 70;
const STARS = Array.from({ length: STAR_COUNT }, (_, i) => ({
  x: pseudoRandom(i * 3)     * 100,
  y: pseudoRandom(i * 3 + 1) * 100,
  size: 1 + pseudoRandom(i * 3 + 2) * 1.5,
  baseOpacity: 0.3 + pseudoRandom(i * 7) * 0.55,
  duration: 1500 + pseudoRandom(i * 5) * 2500,
  delay: pseudoRandom(i * 11) * 2500,
}));

export default function WelcomeScreen() {
  const starOpacities = useRef(
    STARS.map(s => new Animated.Value(s.baseOpacity * 0.15))
  ).current;
  const layerOpacity    = useRef(new Animated.Value(0)).current;
  const logoOpacity     = useRef(new Animated.Value(0)).current;
  const logoTranslateY  = useRef(new Animated.Value(10)).current;
  const taglineOpacity  = useRef(new Animated.Value(0)).current;
  const actionsOpacity  = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.timing(layerOpacity, { toValue: 1, duration: 800, useNativeDriver: true }).start();

    STARS.forEach((star, i) => {
      Animated.sequence([
        Animated.delay(star.delay),
        Animated.loop(Animated.sequence([
          Animated.timing(starOpacities[i], { toValue: star.baseOpacity, duration: star.duration, useNativeDriver: true }),
          Animated.timing(starOpacities[i], { toValue: star.baseOpacity * 0.15, duration: star.duration, useNativeDriver: true }),
        ])),
      ]).start();
    });

    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(logoOpacity,    { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoTranslateY, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: true }),
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
      <LinearGradient
        colors={['#020208', '#07031a'] as [string, string]}
        style={StyleSheet.absoluteFill}
      />

      {/* Twinkling starfield */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: layerOpacity }]} pointerEvents="none">
        {STARS.map((star, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
              backgroundColor: '#ffffff',
              opacity: starOpacities[i],
            }}
          />
        ))}
      </Animated.View>

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

      {/* CTA buttons */}
      <Animated.View style={[styles.actions, { opacity: actionsOpacity, transform: [{ translateY: actionsTranslateY }] }]}>
        <Link href="/(auth)/sign-up" asChild>
          <Button label="Get Started" variant="primary" size="lg" fullWidth />
        </Link>
        <View style={styles.spacer} />
        <Link href="/(auth)/sign-in" asChild>
          <Button label="Sign In" variant="ghost" size="lg" fullWidth />
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
    backgroundColor: '#020208',
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
