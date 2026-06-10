import { useState, useCallback } from 'react';
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
} from 'react-native';
import { Link, router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { CaretLeft, Eye, EyeSlash } from 'phosphor-react-native';
import { auth } from '@/services/firebase';
import { Button } from '@/components/ui/Button';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function SignInScreen() {
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

  const togglePassword = useCallback(() => setShowPassword((v) => !v), []);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={['#0a0a1a', '#1a0a3a', '#0a0a1a']}
        style={StyleSheet.absoluteFill}
      />

      {/* Aurora glows */}
      <View style={styles.glow1} />
      <View style={styles.glow2} />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity onPress={() => router.back()} style={styles.back} activeOpacity={0.7}>
          <CaretLeft size={20} color={DarkColors.text.primary} weight="bold" />
        </TouchableOpacity>

        {/* Brand */}
        <Image
          source={require('@/assets/images/SupernovaStar.png')}
          style={styles.star}
          resizeMode="contain"
        />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue your journey</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Email */}
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailFocused && styles.inputFocused]}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder="you@example.com"
            placeholderTextColor={DarkColors.text.tertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex, passwordFocused && styles.inputFocused]}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="••••••••"
              placeholderTextColor={DarkColors.text.tertiary}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
            />
            <TouchableOpacity
              onPress={togglePassword}
              style={[styles.eyeBtn, passwordFocused && styles.inputFocused]}
              activeOpacity={0.7}
              hitSlop={8}
            >
              {showPassword
                ? <EyeSlash size={20} color={DarkColors.text.tertiary} weight="regular" />
                : <Eye size={20} color={DarkColors.text.tertiary} weight="regular" />}
            </TouchableOpacity>
          </View>
        </View>

        <Link href="/(auth)/forgot-password" asChild>
          <TouchableOpacity style={styles.forgotWrap} activeOpacity={0.7}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </TouchableOpacity>
        </Link>

        <Button
          label="Sign In"
          onPress={handleSignIn}
          loading={loading}
          fullWidth
          size="lg"
          style={styles.cta}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: Spacing['6'], paddingTop: Spacing['16'] },
  back: { marginBottom: Spacing['8'] },
  star: { width: 78, height: 78, marginBottom: Spacing['4'] },
  backText: { color: Colors.brand.purple, fontSize: FontSize.base },
  title: { fontSize: FontSize['3xl'], fontWeight: FontWeight.black, color: Colors.white, marginBottom: Spacing['2'] },
  subtitle: { fontSize: FontSize.base, color: Colors.text.secondary, marginBottom: Spacing['8'] },
  error: { color: Colors.semantic.error, fontSize: FontSize.sm, marginBottom: Spacing['4'], backgroundColor: 'rgba(248,113,113,0.1)', padding: Spacing['3'], borderRadius: BorderRadius.md },
  field: { marginBottom: Spacing['5'] },
  label: {
    fontSize: FontSize.sm, fontWeight: FontWeight.medium,
    color: DarkColors.text.secondary, marginBottom: Spacing['2'],
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
  },
  inputFocused: {
    borderColor: DarkColors.brand.purple,
    backgroundColor: 'rgba(167,139,250,0.06)',
  },
  inputRow: { flexDirection: 'row', gap: Spacing['2'] },
  inputFlex: { flex: 1 },
  eyeBtn: {
    width: 52, height: 52,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: Spacing['6'] },
  forgot: { color: DarkColors.brand.purple, fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  cta: { marginBottom: Spacing['6'] },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing['4'] },
  footerText: { color: DarkColors.text.secondary, fontSize: FontSize.sm },
  footerLink: { color: DarkColors.brand.purple, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
