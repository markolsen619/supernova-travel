import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GoogleLogo, AppleLogo } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { signInWithGoogle, isAppleAuthAvailable } from '@/services/oauth';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

// No props needed — the component owns its own error display (see `error`
// below), matching UsernameField/BirthdayField's local-ownership pattern
// instead of bubbling a message up to the host screen's top-of-form error
// box, which on sign-up sits a screen and a half above this button.
export default function SocialAuthButtons() {
  const { colors } = useTheme();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    isAppleAuthAvailable().then((available) => {
      if (!cancelled) setAppleAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoogle = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGoogleLoading(true);
    setError(null);
    try {
      const credential = await signInWithGoogle();
      // null means the user dismissed the sheet. Cancelling is a normal
      // outcome, not a failure — show nothing. This is a return-value
      // check, not a catch: since v13 the SDK resolves with
      // { type: 'cancelled' } instead of throwing.
      if (!credential) return;
      // No navigation on success — the auth listener in _layout owns routing.
    } catch (e: any) {
      if (e?.code === 'auth/account-exists-with-different-credential') {
        setError('You already have an account with this email. Sign in with your password.');
      } else if (e?.code === 'auth/network-request-failed') {
        setError("Couldn't reach the network. Check your connection and try again.");
      } else {
        setError('Sign in failed. Try again in a moment.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.background.cardBorder }]} />
        <Text style={[styles.dividerText, { color: colors.text.tertiary }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.background.cardBorder }]} />
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: `${colors.semantic.error}14` }]}>
          <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
        </View>
      ) : null}

      <Button
        label="Continue with Google"
        onPress={handleGoogle}
        loading={googleLoading}
        variant="secondary"
        size="lg"
        fullWidth
        haptic="none"
        icon={GoogleLogo}
        style={appleAvailable ? styles.googleButtonSpaced : undefined}
      />

      {/* isAppleAuthAvailable() resolves false in Phase 1, so this slot never
          renders yet — the sign-in handler ships with expo-apple-authentication
          in Phase 2 (Task 12), which wires onPress here.
          TODO(Phase 2): this Button has no onPress, so haptic="none" is a
          placeholder to avoid a buzz-for-nothing tap. Once onPress is wired,
          revisit whether the screen fires its own haptic (matching Google's
          pattern above) or this default should change. */}
      {appleAvailable ? (
        <Button
          label="Continue with Apple"
          variant="secondary"
          size="lg"
          fullWidth
          haptic="none"
          icon={AppleLogo}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['5'],
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  errorBox: { padding: Spacing['3'], borderRadius: BorderRadius.md, marginBottom: Spacing['4'] },
  errorText: { fontSize: FontSize.sm },
  dividerText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  googleButtonSpaced: {
    marginBottom: Spacing['3'],
  },
});
