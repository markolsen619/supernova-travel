import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, LayoutChangeEvent } from 'react-native';
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
// Button does. Its height MUST match the Google button above it, but that
// height can't be computed from Button.tsx's style table: Button.tsx's
// `styles.text` (label) sets only `fontWeight`, no `lineHeight`, so the
// rendered row height comes from the system font's natural line height for
// FontSize.md — which varies by platform and Dynamic Type setting, not a
// fixed multiple of fontSize. So it's measured, not computed: the Google
// button is wrapped in a View with onLayout, and that measured height feeds
// both the Apple button's height and its cornerRadius (height / 2, to keep
// the same full-pill shape as Google's BorderRadius.full).
//
// This is the pre-layout fallback only, used for the one frame before
// onLayout fires. Deliberately UNDER the real height (Button 'lg' is
// ~52-54pt in practice) rather than over it: a one-frame flash of
// slightly-short is far less visible than a flash of too-tall that then
// visibly shrinks — and importantly, too-tall would (for one frame) make
// this secondary control the largest element on the screen, outsizing the
// primary CTA.
const FALLBACK_APPLE_BUTTON_HEIGHT = 52;

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
  // Measured height of the Google button's own box (margin excluded — see
  // the wrapping View below), fed into the Apple button's style + cornerRadius.
  const [googleButtonHeight, setGoogleButtonHeight] = useState(FALLBACK_APPLE_BUTTON_HEIGHT);

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

  // Button.tsx does not spread unknown props onto its root TouchableOpacity
  // (its destructured prop list has no rest/spread), so onLayout has to go
  // on a wrapping View instead — passing it to <Button> directly would be
  // silently dropped.
  const handleGoogleButtonLayout = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    setGoogleButtonHeight((prev) => (prev === height ? prev : height));
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

      <View
        onLayout={handleGoogleButtonLayout}
        // Spacing to the Apple button below lives on this wrapper, not on
        // the Button itself — keeping it off the measured box so
        // googleButtonHeight reflects only the button's own height, not the
        // gap after it.
        style={appleAvailable ? styles.googleButtonWrapperSpaced : undefined}
      >
        <Button
          label="Continue with Google"
          onPress={handleGoogle}
          loading={googleLoading}
          variant="secondary"
          size="lg"
          fullWidth
          haptic="none"
          icon={GoogleLogo}
        />
      </View>

      {appleAvailable ? (
        <View
          style={[styles.appleButtonContainer, { height: googleButtonHeight }]}
          pointerEvents={appleLoading ? 'none' : 'auto'}
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            // Apple mandates its own predefined button colors for this
            // control — App Store review checks for it — so this is
            // deliberately NOT theme-reactive. Do not swap for useTheme()
            // colors; that would fail Guideline 4.8. Same exception pattern
            // as the always-dark screens documented in CLAUDE.md.
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={Math.round(googleButtonHeight / 2)}
            style={[styles.appleButton, { height: googleButtonHeight }]}
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
  googleButtonWrapperSpaced: {
    marginBottom: Spacing['3'],
  },
  appleButtonContainer: {
    width: '100%',
  },
  appleButton: {
    width: '100%',
  },
  appleButtonLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
