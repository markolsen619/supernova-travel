import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '@/services/firebase';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isUnder13 = () => {
    if (!dob) return false;
    const birth = new Date(dob);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    return age < 13;
  };

  const handleSignUp = async () => {
    if (!displayName || !email || !password || !dob) { setError('Please fill in all fields.'); return; }
    if (isUnder13()) { setError('You must be 13 or older to use Supernova.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(user, { displayName });
      await setDoc(doc(db, 'users', user.uid), {
        displayName,
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
    } catch (e: any) {
      setError(e.code === 'auth/email-already-in-use' ? 'An account with this email already exists.' : 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#0a0a1a', '#1a0a3a']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Join Supernova</Text>
        <Text style={styles.subtitle}>Start exploring the universe of travel</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {[
          { label: 'Display Name', value: displayName, set: setDisplayName, placeholder: 'Your travel name', autoCap: 'words' as const },
          { label: 'Email', value: email, set: setEmail, placeholder: 'you@example.com', keyboard: 'email-address' as const, autoCap: 'none' as const },
          { label: 'Date of Birth', value: dob, set: setDob, placeholder: 'YYYY-MM-DD', autoCap: 'none' as const },
        ].map(({ label, value, set, placeholder, keyboard, autoCap }) => (
          <View key={label} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={set}
              placeholder={placeholder}
              placeholderTextColor={Colors.text.tertiary}
              keyboardType={keyboard ?? 'default'}
              autoCapitalize={autoCap ?? 'sentences'}
              autoCorrect={false}
            />
          </View>
        ))}

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 8 characters"
            placeholderTextColor={Colors.text.tertiary}
            secureTextEntry
          />
        </View>

        <Button label="Create Account" onPress={handleSignUp} loading={loading} fullWidth size="lg" style={styles.cta} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign In</Text>
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
  backText: { color: Colors.brand.purple, fontSize: FontSize.base },
  title: { fontSize: FontSize['3xl'], fontWeight: FontWeight.black, color: Colors.white, marginBottom: Spacing['2'] },
  subtitle: { fontSize: FontSize.base, color: Colors.text.secondary, marginBottom: Spacing['8'] },
  error: { color: Colors.semantic.error, fontSize: FontSize.sm, marginBottom: Spacing['4'], backgroundColor: 'rgba(248,113,113,0.1)', padding: Spacing['3'], borderRadius: BorderRadius.md },
  field: { marginBottom: Spacing['5'] },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text.secondary, marginBottom: Spacing['2'] },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: BorderRadius.lg, padding: Spacing['4'], color: Colors.white, fontSize: FontSize.base },
  cta: { marginBottom: Spacing['6'], marginTop: Spacing['2'] },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing['4'] },
  footerText: { color: Colors.text.secondary, fontSize: FontSize.sm },
  footerLink: { color: Colors.brand.purple, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
