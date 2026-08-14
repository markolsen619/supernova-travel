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
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import * as Haptics from 'expo-haptics';
import { CaretLeft, Eye, EyeSlash } from 'phosphor-react-native';
import { auth } from '@/services/firebase';
import { createUserProfile } from '@/services/profile';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { DarkColors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import UsernameField from '@/components/auth/UsernameField';
import BirthdayField from '@/components/auth/BirthdayField';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import { claimUsername } from '@/services/usernames';

export default function SignUpScreen() {
  const { colors } = useTheme();

  // ── Dark splash → light auth handoff — see sign-in.tsx for the matching
  // treatment; plays once on first mount only.
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.timing(revealOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.spring(contentOpacity, { toValue: 1, ...SPRING }),
        Animated.spring(contentTranslateY, { toValue: 0, ...SPRING }),
      ]),
    ]).start();
  }, []);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [birthdayValid, setBirthdayValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [usernameValid, setUsernameValid] = useState(false);
  const [usernameBlocking, setUsernameBlocking] = useState(false);

  const handleConfirmPasswordChange = useCallback((value: string) => {
    setConfirmPassword(value);
    setError('');
  }, []);

  // Live match check once both fields have content — avoids nagging while
  // the user is still mid-type on either field.
  useEffect(() => {
    if (!confirmPassword) {
      setConfirmPasswordError(null);
      return;
    }
    setConfirmPasswordError(password === confirmPassword ? null : "Passwords don't match.");
  }, [password, confirmPassword]);

  const handleSignUp = useCallback(async () => {
    if (!fullName.trim() || !username.trim() || !email.trim() || !password || !confirmPassword || !dob) {
      setError('Fill in all fields to continue.');
      return;
    }
    if (!usernameValid) return;
    if (!birthdayValid) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Firebase Auth's own profile field is literally named `displayName`
      // — that's Firebase's API surface, not our Firestore schema.
      await updateProfile(user, { displayName: fullName.trim() });

      // Claim the username now that we're authenticated (the claims
      // collection requires auth to write). This is a rare race, not a
      // pre-check failure — availability was already confirmed live above —
      // so on the off chance someone else claimed it in the last few
      // seconds, don't strand the new account: finish sign-up with no
      // username rather than fail the whole flow. It can be set from Edit
      // profile afterward, where the same check runs again.
      const claimResult = await claimUsername(user.uid, username, '');
      const claimedUsername = claimResult === 'ok' ? username : '';

      await createUserProfile(user.uid, { fullName, username: claimedUsername });
      router.replace('/(auth)/onboarding');
    } catch (e: any) {
      setError(
        e.code === 'auth/email-already-in-use'
          ? 'An account with this email already exists.'
          : 'Sign up failed. Try again in a moment.',
      );
    } finally {
      setLoading(false);
    }
  }, [fullName, username, usernameValid, email, password, confirmPassword, dob, birthdayValid]);

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
        <TouchableOpacity onPress={handleBack} style={styles.back} activeOpacity={0.7} hitSlop={8} accessibilityLabel="Back">
          <CaretLeft size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>

        {/* Brand — the star mark's own gradient art is the one hit of brand color on this screen. */}
        <StarMark size={78} style={styles.star} />
        <Text style={[styles.title, { color: colors.text.primary }]}>Join Supernova</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Start exploring the universe of travel</Text>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: `${colors.semantic.error}14` }]}>
            <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
          </View>
        ) : null}

        {/* Full name */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Full name</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary },
              nameFocused && { borderColor: colors.brand.purple },
            ]}
            value={fullName}
            onChangeText={setFullName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="Your full name"
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        {/* Username */}
        <UsernameField
          value={username}
          onChangeText={setUsername}
          onValidityChange={setUsernameValid}
          onBlockingChange={setUsernameBlocking}
        />

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

        {/* Date of birth */}
        <BirthdayField value={dob} onChange={setDob} onValidityChange={setBirthdayValid} />

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
              placeholder="Min. 8 characters"
              placeholderTextColor={colors.text.tertiary}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSignUp}
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

        {/* Confirm password */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Confirm password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                styles.inputFlex,
                { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary },
                confirmPasswordFocused && { borderColor: colors.brand.purple },
                confirmPasswordError && { borderColor: colors.semantic.error },
              ]}
              value={confirmPassword}
              onChangeText={handleConfirmPasswordChange}
              onFocus={() => setConfirmPasswordFocused(true)}
              onBlur={() => setConfirmPasswordFocused(false)}
              placeholder="Re-enter your password"
              placeholderTextColor={colors.text.tertiary}
              secureTextEntry={!showConfirmPassword}
              returnKeyType="done"
              onSubmitEditing={handleSignUp}
            />
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowConfirmPassword((v) => !v);
              }}
              style={[
                styles.eyeBtn,
                { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
                confirmPasswordFocused && { borderColor: colors.brand.purple },
              ]}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword
                ? <EyeSlash size={20} color={colors.text.tertiary} weight="regular" />
                : <Eye size={20} color={colors.text.tertiary} weight="regular" />}
            </TouchableOpacity>
          </View>
          {confirmPasswordError ? (
            <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{confirmPasswordError}</Text>
          ) : null}
        </View>

        {/* Not the hero gradient — that's reserved for the star mark above. */}
        <Button
          label="Create account"
          onPress={handleSignUp}
          loading={loading}
          disabled={usernameBlocking || !!confirmPasswordError}
          fullWidth
          size="lg"
          style={styles.cta}
        />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.text.secondary }]}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Text style={[styles.footerLink, { color: colors.brand.purple }]}>Sign in</Text>
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
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['2'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    fontSize: FontSize.base,
  },
  fieldError: { fontSize: FontSize.xs, marginTop: Spacing['2'] },
  inputRow: { flexDirection: 'row', gap: Spacing['2'] },
  inputFlex: { flex: 1 },
  eyeBtn: {
    width: 52, height: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cta: { marginBottom: Spacing['6'], marginTop: Spacing['2'] },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing['4'],
  },
  footerText: { fontSize: FontSize.sm },
  footerLink: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
});
