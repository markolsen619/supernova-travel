import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { FontSize } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      {/* Background aurora */}
      <LinearGradient
        colors={['#0a0a1a', '#1a0a3a', '#0a0a1a']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glow1} />
      <View style={styles.glow2} />

      {/* Logo area */}
      <View style={styles.hero}>
        <Image
          source={require('@/assets/images/SupernovaLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Travel the universe, together.</Text>
      </View>

      {/* CTAs */}
      <View style={styles.actions}>
        <Link href="/(auth)/sign-up" asChild>
          <Button label="Get Started" variant="primary" size="lg" fullWidth />
        </Link>
        <View style={styles.spacer} />
        <Link href="/(auth)/sign-in" asChild>
          <Button label="Sign In" variant="ghost" size="lg" fullWidth />
        </Link>
      </View>

      <Text style={styles.terms}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  glow1: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(120,80,255,0.25)',
  },
  glow2: {
    position: 'absolute',
    bottom: 100,
    left: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(244,114,182,0.18)',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
  },
  logo: {
    width: width * 0.65,
    height: 120,
    marginBottom: Spacing['4'],
  },
  tagline: {
    fontSize: FontSize.md,
    color: Colors.text.secondary,
    textAlign: 'center',
    letterSpacing: LetterSpacing.wide,
  },
  actions: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['6'],
  },
  spacer: { height: Spacing['3'] },
  terms: {
    fontSize: FontSize.xs,
    color: Colors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['8'],
    lineHeight: 16,
  },
});
