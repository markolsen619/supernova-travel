import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleLogo } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { signInWithGoogle, signInWithApple, isAppleAuthAvailable } from '@/services/oauth';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

// Apple's native button renders NOTHING (silently, no error) without explicit
// dimensions — it does not size itself off content the way the app's own
// Button does. Height is derived, not guessed, to match the Google button
// directly above it: Button 'lg' uses paddingVertical Spacing['4'] (16) on
// each side plus FontSize.md (17) text at LineHeight.normal (1.5) →
// 16*2 + 17*1.5 = 57.5, rounded to 58. cornerRadius is half that (29) so the
// button reads as the same full pill as Google's BorderRadius.full.
const APPLE_BUTTON_HEIGHT = 58;
const APPLE_BUTTON_CORNER_RADIUS = APPLE_BUTTON_HEIGHT / 2;

// No props needed — the component owns its own error display (see `error`
// below), matching UsernameField/BirthdayField's local-ownership pattern
// instead of bubbling a message up to the host screen's top-of-form error
// box, which on sign-up sits a screen and a half above this button.
export default function SocialAuthButtons() {
  const { colors } = useTheme();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
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

  const handleApple = useCallback(async () => {
    // ASAuthorizationAppleIDButton is not a TouchableOpacity, so it never
    // reaches Button.tsx's defaultHapticByVariant machinery — the haptic has
    // to be fired explicitly here, mirroring handleGoogle above.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAppleLoading(true);
    setError(null);
    try {
      const credential = await signInWithApple();
      // null means the user dismissed the sheet. Cancelling is a normal
      // outcome, not a failure — show nothing.
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
      setAppleLoading(false);
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

      {appleAvailable ? (
        <View style={styles.appleButtonContainer} pointerEvents={appleLoading ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            // Apple mandates its own predefined button colors for this
            // control — App Store review checks for it — so this is
            // deliberately NOT theme-reactive. Do not swap for useTheme()
            // colors; that would fail Guideline 4.8. Same exception pattern
            // as the always-dark screens documented in CLAUDE.md.
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={APPLE_BUTTON_CORNER_RADIUS}
            style={styles.appleButton}
            onPress={handleApple}
          />
          {appleLoading ? (
            <View style={styles.appleButtonLoadingOverlay} pointerEvents="none">
              <ActivityIndicator color={colors.white} size="small" />
            </View>
          ) : null}
        </View>
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
  appleButtonContainer: {
    width: '100%',
    height: APPLE_BUTTON_HEIGHT,
  },
  appleButton: {
    width: '100%',
    height: APPLE_BUTTON_HEIGHT,
  },
  appleButtonLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
