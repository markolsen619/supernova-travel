import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import * as Haptics from 'expo-haptics';
import { auth } from '@/services/firebase';
import { createUserProfile } from '@/services/profile';
import { hydrateSession } from '@/services/session';
import { signOutGoogle } from '@/services/oauth';
import { claimUsername } from '@/services/usernames';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { DarkColors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import UsernameField from '@/components/auth/UsernameField';
import BirthdayField from '@/components/auth/BirthdayField';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

// The gate a Firebase-Auth-but-no-Firestore-doc user lands on (OAuth sign-in
// that skipped the normal sign-up form). No back button on purpose — going
// back would strand the user signed in with nowhere to go. The only way off
// this screen besides finishing it is "Use a different account", which signs
// out and lets the root auth listener route back to welcome.
export default function CompleteProfileScreen() {
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

  const [fullName, setFullName] = useState(auth.currentUser?.displayName ?? '');
  const [nameFocused, setNameFocused] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [dob, setDob] = useState<Date | null>(null);
  const [birthdayValid, setBirthdayValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nameValid = fullName.trim().length > 0;
  const canContinue = nameValid && usernameValid && birthdayValid;

  // A disabled Continue with no explanation is a dead end — say exactly
  // what's missing, in the order the fields appear on screen.
  const disabledReason = useMemo(() => {
    if (!nameValid) return 'Add your name to continue.';
    if (!usernameValid) return 'Choose a username to continue.';
    if (!birthdayValid) return 'Add your date of birth to continue.';
    return null;
  }, [nameValid, usernameValid, birthdayValid]);

  const handleContinue = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !dob) return;
    setLoading(true);
    setError('');
    try {
      // Idempotency guard: if the profile document already exists (e.g. this
      // account finished sign-up elsewhere while sitting on this gate), don't
      // re-claim/re-write it — just hydrate and move on. Closes the
      // signup/gate race.
      const { hasProfile: alreadyExists } = await hydrateSession(user);
      if (!alreadyExists) {
        // Mirrors sign-up.tsx: a lost race must not strand the account. Finish
        // with no username rather than fail; it can be set from Edit profile.
        const claimResult = await claimUsername(user.uid, username, '');
        await createUserProfile(user.uid, {
          fullName,
          username: claimResult === 'ok' ? username : '',
        });
        // The doc now exists, but this write does not re-fire
        // onAuthStateChanged — hydrate here so tier/profile/push-token/
        // RevenueCat are set before entering the app this session, not next
        // cold start. Isolated in its own try: a failure here must not be
        // reported as "could not save your profile" when the write itself
        // already succeeded.
        try {
          await hydrateSession(user);
        } catch (hydrateError) {
          console.warn('[complete-profile] profile saved but session hydration failed:', hydrateError);
        }
      }
      router.replace('/(auth)/onboarding');
    } catch (error) {
      console.warn('[complete-profile] could not save profile:', error);
      setError('Could not save your profile. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [fullName, username, dob]);

  const handleUseAnotherAccount = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Release the native Google session too — otherwise the SDK silently
    // re-authorizes the same account and this button loops back to itself.
    await signOutGoogle();
    await signOut(auth);
    // The auth listener in _layout owns routing; do not navigate manually.
  }, []);

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={[styles.flex, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand — the star mark's own gradient art is the one hit of brand color on this screen. */}
        <StarMark size={78} style={styles.star} />
        <Text style={[styles.title, { color: colors.text.primary }]}>Finish your profile</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Pick a username so people can find you.</Text>

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
          {!nameValid ? (
            <Text style={[styles.fieldHint, { color: colors.text.tertiary }]}>Shown on your profile.</Text>
          ) : null}
        </View>

        {/* Username — forUid so the field doesn't flag this account's own
            current username as taken. */}
        <UsernameField
          value={username}
          onChangeText={setUsername}
          onValidityChange={setUsernameValid}
          forUid={auth.currentUser?.uid}
        />

        {/* Date of birth */}
        <BirthdayField value={dob} onChange={setDob} onValidityChange={setBirthdayValid} />

        {disabledReason ? (
          <Text style={[styles.disabledReason, { color: colors.text.tertiary }]}>{disabledReason}</Text>
        ) : null}

        <Button
          label="Continue"
          onPress={handleContinue}
          loading={loading}
          disabled={!canContinue}
          fullWidth
          size="lg"
          style={styles.cta}
        />

        <TouchableOpacity
          onPress={handleUseAnotherAccount}
          style={styles.switchAccount}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Text style={[styles.switchAccountText, { color: colors.text.secondary }]}>Use a different account</Text>
        </TouchableOpacity>
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
  fieldHint: { fontSize: FontSize.xs, marginTop: Spacing['2'] },

  disabledReason: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginBottom: Spacing['3'],
  },

  cta: { marginBottom: Spacing['4'], marginTop: Spacing['2'] },

  switchAccount: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing['4'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchAccountText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
