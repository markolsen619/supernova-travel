import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { CANCEL_REASONS } from '@/utils/cancellation';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Reason and note are whatever the user gave — both may be empty. */
  onContinue: (reason: string | null, note: string) => void;
}

/**
 * Asked once on the way out, then out of the way.
 *
 * Every affordance here leads forward. There is no "are you sure", no
 * retention offer, and nothing to dismiss twice: Apple requires cancelling an
 * auto-renewing subscription to be reachable without obstruction, and a
 * survey that has to be defeated is obstruction. Selecting a reason is
 * optional and "Continue" is enabled from the first render.
 *
 * The actual cancellation happens after this, in RevenueCat's Customer
 * Center. This screen cannot cancel anything and must never imply it did.
 */
export function CancelReasonSheet({ visible, onClose, onContinue }: Props) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const handleSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Tapping the chosen one again clears it — a survey you cannot un-answer
    // is a small trap.
    setReason((current) => (current === id ? null : id));
  }, []);

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onContinue(reason, note);
  }, [reason, note, onContinue]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background.primary }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>SUPERNOVA PRO</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>Before you go</Text>
          <Text style={[styles.body, { color: colors.text.secondary }]}>
            If you have a moment, tell us what didn&apos;t work. It genuinely shapes what gets
            built next. Skipping is fine.
          </Text>

          <View style={styles.reasons}>
            {CANCEL_REASONS.map((r) => {
              const selected = reason === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => handleSelect(r.id)}
                  style={[
                    styles.reason,
                    {
                      backgroundColor: selected ? colors.background.sunken : colors.background.card,
                      borderColor: selected ? colors.brand.purple : colors.background.cardBorder,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={r.label}
                >
                  <Text style={[styles.reasonText, { color: colors.text.primary }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[
              styles.note,
              {
                backgroundColor: colors.background.card,
                borderColor: colors.background.cardBorder,
                color: colors.text.primary,
              },
            ]}
            value={note}
            onChangeText={setNote}
            placeholder="Anything else? (optional)"
            placeholderTextColor={colors.text.tertiary}
            multiline
            maxLength={500}
          />
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.background.cardBorder }]}>
          {/* Enabled from the first render — nothing here gates the exit. */}
          <Button label="Continue to cancel" onPress={handleContinue} fullWidth size="lg" />
          <Pressable onPress={onClose} style={styles.keepBtn} accessibilityRole="button">
            <Text style={[styles.keepText, { color: colors.text.secondary }]}>Keep my subscription</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing['6'], paddingBottom: Spacing['8'], gap: Spacing['2'] },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  body: { fontSize: FontSize.base, lineHeight: FontSize.base * 1.5, marginBottom: Spacing['4'] },
  reasons: { gap: Spacing['2'] },
  reason: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reasonText: { fontSize: FontSize.base },
  note: {
    marginTop: Spacing['4'],
    minHeight: 88,
    padding: Spacing['4'],
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: FontSize.base,
    textAlignVertical: 'top',
  },
  footer: {
    padding: Spacing['6'],
    paddingTop: Spacing['4'],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing['3'],
  },
  keepBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  keepText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
});
