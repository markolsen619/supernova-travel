import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'phosphor-react-native';
import { auth } from '@/services/firebase';
import { Button } from '@/components/ui/Button';
import { StarField } from '@/components/animations/StarField';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email) { setError('Please enter your email.'); return; }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch {
      setError('Could not send reset email. Please check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={['#070712', '#180836', '#0a0a1a'] as [string, string, string]}
        style={StyleSheet.absoluteFill}
      />
      <StarField starCount={20} opacity={0.35} animated={false} />

      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={20} color={DarkColors.brand.purple} weight="duotone" />
        </TouchableOpacity>

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          {sent ? 'Check your email for a reset link.' : "We'll send a reset link to your email."}
        </Text>

        {!sent && (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.formCard}>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={DarkColors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <Button label="Send Reset Link" onPress={handleReset} loading={loading} fullWidth size="lg" />
          </>
        )}

        {sent && (
          <Button label="Back to Sign In" onPress={() => router.replace('/(auth)/sign-in')} variant="secondary" fullWidth size="lg" />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: Spacing['6'], paddingTop: Spacing['16'] },
  back: { marginBottom: Spacing['8'] },
  title: { fontSize: FontSize['3xl'], fontWeight: FontWeight.black, color: DarkColors.text.primary, marginBottom: Spacing['2'] },
  subtitle: { fontSize: FontSize.base, color: DarkColors.text.secondary, marginBottom: Spacing['8'] },
  error: { color: DarkColors.semantic.error, fontSize: FontSize.sm, marginBottom: Spacing['4'], backgroundColor: 'rgba(248,113,113,0.1)', padding: Spacing['3'], borderRadius: BorderRadius.md },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius['2xl'],
    padding: Spacing['5'],
    marginBottom: Spacing['4'],
  },
  field: { marginBottom: Spacing['2'] },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: DarkColors.text.secondary, marginBottom: Spacing['2'] },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
  },
});
