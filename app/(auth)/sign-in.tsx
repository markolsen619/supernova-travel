import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { Link, router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import * as Haptics from 'expo-haptics';
import { CaretLeft, Eye, EyeSlash } from 'phosphor-react-native';
import { auth } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { DarkColors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function SignInScreen() {
  const { colors } = useTheme();

  // ── Dark splash → light auth handoff (signature moment, mirrors the
  // opposite fade used entering ai-generating.tsx) — plays once on first
  // mount only, not on back-navigation returns to an already-mounted screen.
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.timing(revealOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.spring(contentOpacity, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }),
        Animated.spring(contentTranslateY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = useCallback(async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      setError(e.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const togglePassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPassword((v) => !v);
  }, []);

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={[styles.flex, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity onPress={handleBack} style={styles.back} activeOpacity={0.7} hitSlop={8} accessibilityLabel="Back">
          <CaretLeft size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>

        {/* Brand — the star mark's own gradient art is the one hit of brand color on this screen. */}
        <Image
          source={require('@/assets/images/SupernovaStar.png')}
          style={styles.star}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: colors.text.primary }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Sign in to continue your journey</Text>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: `${colors.semantic.error}14` }]}>
            <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
          </View>
        ) : null}

        {/* Email */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary },
              emailFocused && { borderColor: colors.brand.purple },
            ]}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder="you@example.com"
            placeholderTextColor={colors.text.tertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                styles.inputFlex,
                { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary },
                passwordFocused && { borderColor: colors.brand.purple },
              ]}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="••••••••"
              placeholderTextColor={colors.text.tertiary}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
            />
            <TouchableOpacity
              onPress={togglePassword}
              style={[
                styles.eyeBtn,
                { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
                passwordFocused && { borderColor: colors.brand.purple },
              ]}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword
                ? <EyeSlash size={20} color={colors.text.tertiary} weight="regular" />
                : <Eye size={20} color={colors.text.tertiary} weight="regular" />}
            </TouchableOpacity>
          </View>
        </View>

        <Link href="/(auth)/forgot-password" asChild>
          <TouchableOpacity
            style={styles.forgotWrap}
            activeOpacity={0.7}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          >
            <Text style={[styles.forgot, { color: colors.brand.purple }]}>Forgot password?</Text>
          </TouchableOpacity>
        </Link>

        {/* Not the hero gradient — that's reserved for the star mark above. */}
        <Button
          label="Sign in"
          onPress={handleSignIn}
          loading={loading}
          fullWidth
          size="lg"
          style={styles.cta}
        />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.text.secondary }]}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Text style={[styles.footerLink, { color: colors.brand.purple }]}>Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
      </Animated.View>

      {/* Fades out on first mount only, revealing the light content — the
          arrival counterpart to ai-generating.tsx's fade-out-into-dark. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: DarkColors.background.primary, opacity: revealOpacity }]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: Spacing['6'], paddingTop: Spacing['16'] },
  back: { marginBottom: Spacing['8'], minWidth: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  star: { width: 78, height: 78, marginBottom: Spacing['4'] },
  title: { fontSize: FontSize['3xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.02 * FontSize['3xl'], marginBottom: Spacing['2'] },
  subtitle: { fontSize: FontSize.base, marginBottom: Spacing['8'] },
  errorBox: { padding: Spacing['3'], borderRadius: BorderRadius.md, marginBottom: Spacing['4'] },
  errorText: { fontSize: FontSize.sm },
  field: { marginBottom: Spacing['5'] },
  label: {
    fontSize: FontSize.sm, fontWeight: FontWeight.medium,
    marginBottom: Spacing['2'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    fontSize: FontSize.base,
  },
  inputRow: { flexDirection: 'row', gap: Spacing['2'] },
  inputFlex: { flex: 1 },
  eyeBtn: {
    width: 52, height: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: Spacing['6'] },
  forgot: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  cta: { marginBottom: Spacing['6'] },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing['4'] },
  footerText: { fontSize: FontSize.sm },
  footerLink: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
