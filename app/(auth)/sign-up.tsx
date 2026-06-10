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
  Modal,
} from 'react-native';
import { Link, router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { CaretLeft, Eye, EyeSlash, CalendarBlank } from 'phosphor-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth, db } from '@/services/firebase';
import { Button } from '@/components/ui/Button';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function SignUpScreen() {
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
      setError('Please fill in all fields.');
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
          : 'Sign up failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [displayName, email, password, dob, isUnder13]);

  const togglePassword = useCallback(() => setShowPassword((v) => !v), []);

  const onDateChange = useCallback((_: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setDob(selectedDate);
  }, []);

  const formatDob = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={['#0a0a1a', '#1a0a3a', '#0a0a1a']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.glow1} />
      <View style={styles.glow2} />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.back} activeOpacity={0.7}>
          <CaretLeft size={20} color={DarkColors.text.primary} weight="bold" />
        </TouchableOpacity>

        <Image
          source={require('@/assets/images/SupernovaStar.png')}
          style={styles.star}
          resizeMode="contain"
        />
        <Text style={styles.title}>Join Supernova</Text>
        <Text style={styles.subtitle}>Start exploring the universe of travel</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Display Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={[styles.input, nameFocused && styles.inputFocused]}
            value={displayName}
            onChangeText={setDisplayName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="Your travel name"
            placeholderTextColor={DarkColors.text.tertiary}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

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

        {/* Date of Birth */}
        <View style={styles.field}>
          <Text style={styles.label}>Date of Birth</Text>
          <TouchableOpacity
            style={[styles.input, styles.dobRow]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.8}
          >
            <CalendarBlank
              size={18}
              color={dob ? DarkColors.text.primary : DarkColors.text.tertiary}
              weight="regular"
            />
            <Text style={[styles.dobText, { color: dob ? DarkColors.text.primary : DarkColors.text.tertiary }]}>
              {dob ? formatDob(dob) : 'Select your date of birth'}
            </Text>
          </TouchableOpacity>
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
              placeholder="Min. 8 characters"
              placeholderTextColor={DarkColors.text.tertiary}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSignUp}
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

        <Button
          label="Create Account"
          onPress={handleSignUp}
          loading={loading}
          fullWidth
          size="lg"
          style={styles.cta}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>

      {/* iOS date picker in a bottom sheet modal */}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <TouchableOpacity style={styles.pickerBackdrop} onPress={() => setShowDatePicker(false)} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} hitSlop={8}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dob ?? maxDobDate}
                mode="date"
                display="spinner"
                onChange={onDateChange}
                maximumDate={maxDobDate}
                minimumDate={new Date(1900, 0, 1)}
                textColor={DarkColors.text.primary}
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
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: DarkColors.text.secondary,
    marginBottom: Spacing['2'],
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
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  dobText: { fontSize: FontSize.base, flex: 1 },
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

  cta: { marginBottom: Spacing['6'], marginTop: Spacing['2'] },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing['4'],
  },
  footerText: { color: DarkColors.text.secondary, fontSize: FontSize.sm },
  footerLink: {
    color: DarkColors.brand.purple,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },

  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: {
    backgroundColor: '#1a0a3a',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing['4'],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  pickerDone: {
    color: DarkColors.brand.purple,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
});
