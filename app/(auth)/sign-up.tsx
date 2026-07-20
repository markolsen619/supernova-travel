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
  Modal,
  Animated,
} from 'react-native';
import { Link, router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { CaretLeft, Eye, EyeSlash, CalendarBlank } from 'phosphor-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth, db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { DarkColors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

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

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 13);

  const isUnder13 = useCallback((date: Date) => {
    const today = new Date();
    const age = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();
    return (m < 0 || (m === 0 && today.getDate() < date.getDate()) ? age - 1 : age) < 13;
  }, []);

  const handleSignUp = useCallback(async () => {
    if (!displayName.trim() || !email.trim() || !password || !dob) {
      setError('Fill in all fields to continue.');
      return;
    }
    if (isUnder13(dob)) {
      setError('You must be 13 or older to use Supernova.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(user, { displayName: displayName.trim() });
      await setDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
        avatarUrl: null,
        bio: '',
        location: '',
        tier: 'free',
        followersCount: 0,
        followingCount: 0,
        createdAt: serverTimestamp(),
        settings: { theme: 'dark', notificationsEnabled: true, privacy: 'public' },
        usage: { weeklyAiTrips: 0, weeklyResetAt: null },
      });
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
  }, [displayName, email, password, dob, isUnder13]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const togglePassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPassword((v) => !v);
  }, []);

  const openDatePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDatePicker(true);
  }, []);

  const closeDatePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDatePicker(false);
  }, []);

  const onDateChange = useCallback((_: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setDob(selectedDate);
  }, []);

  const formatDob = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

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

        {/* Display Name */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Display name</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary },
              nameFocused && { borderColor: colors.brand.purple },
            ]}
            value={displayName}
            onChangeText={setDisplayName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="Your travel name"
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

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

        {/* Date of Birth */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Date of birth</Text>
          <TouchableOpacity
            style={[
              styles.input,
              styles.dobRow,
              { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
            ]}
            onPress={openDatePicker}
            activeOpacity={0.8}
          >
            <CalendarBlank
              size={18}
              color={dob ? colors.text.primary : colors.text.tertiary}
              weight="regular"
            />
            <Text style={[styles.dobText, { color: dob ? colors.text.primary : colors.text.tertiary }]}>
              {dob ? formatDob(dob) : 'Select your date of birth'}
            </Text>
          </TouchableOpacity>
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

        {/* Not the hero gradient — that's reserved for the star mark above. */}
        <Button
          label="Create account"
          onPress={handleSignUp}
          loading={loading}
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

      {/* iOS date picker in a bottom sheet modal — matches the rest of the
          (now light) form, not hardcoded dark. */}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <TouchableOpacity style={styles.pickerBackdrop} onPress={closeDatePicker} />
            <View style={[styles.pickerSheet, { backgroundColor: colors.background.elevated }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: colors.background.cardBorder }]}>
                <TouchableOpacity onPress={closeDatePicker} hitSlop={8}>
                  <Text style={[styles.pickerDone, { color: colors.brand.purple }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dob ?? maxDobDate}
                mode="date"
                display="spinner"
                onChange={onDateChange}
                maximumDate={maxDobDate}
                minimumDate={new Date(1900, 0, 1)}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android shows native dialog when showDatePicker is true */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={dob ?? maxDobDate}
          mode="date"
          display="default"
          onChange={onDateChange}
          maximumDate={maxDobDate}
          minimumDate={new Date(1900, 0, 1)}
        />
      )}

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
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  dobText: { fontSize: FontSize.base, flex: 1 },
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

  // Date picker modal
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerDone: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
});
