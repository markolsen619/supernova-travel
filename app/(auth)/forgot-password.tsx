import { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'phosphor-react-native';
import { auth } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email) { setError('Enter your email to reset your password.'); return; }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch {
      setError('The reset email didn\'t send. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <TouchableOpacity onPress={handleBack} style={styles.back} hitSlop={8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text.primary }]}>Reset password</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          {sent ? 'Check your email for a reset link.' : "We'll send a reset link to your email."}
        </Text>

        {!sent && (
          <>
            {error ? (
              <Text style={[styles.error, { color: colors.semantic.error, backgroundColor: `${colors.semantic.error}14` }]}>
                {error}
              </Text>
            ) : null}
            <View style={[styles.formCard, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <Button label="Send reset link" onPress={handleReset} loading={loading} fullWidth size="lg" />
          </>
        )}

        {sent && (
          <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} variant="secondary" fullWidth size="lg" />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: Spacing['6'], paddingTop: Spacing['16'] },
  back: { marginBottom: Spacing['8'], minWidth: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  title: { fontSize: FontSize['3xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.02 * FontSize['3xl'], marginBottom: Spacing['2'] },
  subtitle: { fontSize: FontSize.base, marginBottom: Spacing['8'] },
  error: { fontSize: FontSize.sm, marginBottom: Spacing['4'], padding: Spacing['3'], borderRadius: BorderRadius.md },
  formCard: {
    borderWidth: 1,
    borderRadius: BorderRadius['2xl'],
    padding: Spacing['5'],
    marginBottom: Spacing['4'],
  },
  field: { marginBottom: Spacing['2'] },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing['2'] },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    fontSize: FontSize.base,
  },
});
