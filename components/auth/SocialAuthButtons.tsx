import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GoogleLogo, AppleLogo } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { signInWithGoogle, isAppleAuthAvailable } from '@/services/oauth';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface SocialAuthButtonsProps {
  onError: (message: string) => void;
}

export default function SocialAuthButtons({ onError }: SocialAuthButtonsProps) {
  const { colors } = useTheme();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

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
        onError('You already have an account with this email. Sign in with your password.');
      } else if (e?.code === 'auth/network-request-failed') {
        onError("Couldn't reach the network. Check your connection and try again.");
      } else {
        onError('Sign in failed. Try again in a moment.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }, [onError]);

  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.background.cardBorder }]} />
        <Text style={[styles.dividerText, { color: colors.text.tertiary }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.background.cardBorder }]} />
      </View>

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
          in Phase 2 (Task 12), which wires onPress here. */}
      {appleAvailable ? (
        <Button
          label="Continue with Apple"
          variant="secondary"
          size="lg"
          fullWidth
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
  dividerText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  googleButtonSpaced: {
    marginBottom: Spacing['3'],
  },
});
