import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { checkUsernameAvailability, validateUsernameFormat } from '@/services/usernames';

type UsernameFieldProps = {
  value: string;
  onChangeText: (v: string) => void;
  // false while unresolved, invalid, or a check is in flight;
  // true only once the name is confirmed available
  onValidityChange: (valid: boolean) => void;
  /** true while a check is in flight or the current value is invalid/taken —
   *  mirrors the pre-extraction `usernameChecking || !!usernameError` signal
   *  that the sign-up submit button gates on. Distinct from onValidityChange:
   *  a pristine, untouched field is NOT blocking, but is also NOT yet valid. */
  onBlockingChange?: (blocking: boolean) => void;
  forUid?: string;
};

export default function UsernameField({ value, onChangeText, onValidityChange, onBlockingChange, forUid }: UsernameFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
  }, []);

  const handleChangeText = useCallback((raw: string) => {
    const next = raw.toLowerCase().replace(/\s/g, '');
    onChangeText(next);
    if (checkTimer.current) clearTimeout(checkTimer.current);

    const formatError = validateUsernameFormat(next);
    if (formatError || !next) {
      setError(formatError);
      setChecking(false);
      onValidityChange(false);
      // NOTE: relies on validateUsernameFormat('') === null (see
      // services/usernames.ts) so a cleared field reports blocking:false, not
      // formatError's own truthiness. If that function is ever changed to
      // reject empty strings, this line starts reporting blocking:true for a
      // cleared field and the Continue/Create account button goes dead with
      // no visible error to explain why.
      onBlockingChange?.(!!formatError);
      return;
    }
    setChecking(true);
    setError(null);
    onValidityChange(false);
    onBlockingChange?.(true);
    checkTimer.current = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailability(next, forUid);
        const takenError = available ? null : 'That username is taken.';
        setChecking(false);
        setError(takenError);
        onValidityChange(available);
        onBlockingChange?.(!!takenError);
      } catch {
        // Without this, a rejected check (e.g. offline) would leave the
        // spinner spinning and the CTA permanently disabled with no way out —
        // a hard dead end on complete-profile, where the user is already
        // authenticated. Stays blocking (availability is unconfirmed); the
        // user can retype to retry.
        setChecking(false);
        setError("Couldn't check that username. Try again.");
        onValidityChange(false);
        onBlockingChange?.(true);
      }
    }, 500);
  }, [onChangeText, onValidityChange, onBlockingChange, forUid]);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>Username</Text>
      <View
        style={[
          styles.input,
          styles.usernameRow,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          focused && { borderColor: colors.brand.purple },
          error && { borderColor: colors.semantic.error },
        ]}
      >
        <Text style={[styles.atSign, { color: colors.text.tertiary }]}>@</Text>
        <TextInput
          style={[styles.usernameInput, { color: colors.text.primary }]}
          value={value}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="username"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          returnKeyType="next"
        />
        {checking && <ActivityIndicator size="small" color={colors.text.tertiary} />}
      </View>
      {error ? (
        <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{error}</Text>
      ) : (
        <Text style={[styles.fieldHint, { color: colors.text.tertiary }]}>
          Lowercase letters, numbers, dots, and underscores.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['1'], paddingVertical: 0 },
  atSign: { fontSize: FontSize.base },
  usernameInput: { flex: 1, fontSize: FontSize.base, paddingVertical: Spacing['3'] },
  fieldError: { fontSize: FontSize.xs, marginTop: Spacing['2'] },
  fieldHint: { fontSize: FontSize.xs, marginTop: Spacing['2'] },
});
