import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { CheckCircle, CircleIcon, ShieldCheck, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useModerationStore } from '@/stores/useModerationStore';
import { Button } from '@/components/ui/Button';
import { blockUser, submitReport } from '@/services/moderation';
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
  type ReportTargetType,
} from '@/utils/moderation';
import { SPRING } from '@/constants/motion';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export const REPORT_NOUNS: Record<ReportTargetType, string> = {
  post: 'post',
  comment: 'comment',
  message: 'message',
  trip: 'trip',
  user: 'account',
};

interface ReportSheetProps {
  /** null while closed. */
  target: ReportTarget | null;
  /** Shown in the "Block" offer after reporting. */
  ownerName: string;
  onClose: () => void;
}

/**
 * Reason picker, then a confirmation that offers to block the person too.
 * Reporting hides the content for the reporter on submit; the copy promises
 * the 24-hour review App Store guideline 1.2 asks for (docs/moderation.md).
 */
export function ReportSheet({ target, ownerName, onClose }: ReportSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const isBlocked = useModerationStore((s) => (target ? s.blockedUids.includes(target.ownerUid) : false));

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentProgress = useRef(new Animated.Value(0)).current;

  // A fresh form every time the sheet opens on a new target.
  useEffect(() => {
    if (!target) return;
    setReason(null);
    setDetails('');
    setSending(false);
    setSent(false);
    setBlocking(false);
    setError(null);
    sentProgress.setValue(0);
  }, [target, sentProgress]);

  const noun = target ? REPORT_NOUNS[target.type] : 'content';

  const handleSelect = useCallback((id: ReportReason) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReason(id);
    setError(null);
  }, []);

  const handleSend = useCallback(async () => {
    if (!target || !reason || !uid) return;
    setSending(true);
    setError(null);
    try {
      await submitReport(uid, target, reason, details);
      setSent(true);
      Animated.spring(sentProgress, { toValue: 1, ...SPRING, useNativeDriver: true }).start();
    } catch {
      setError("We couldn't send your report. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }, [target, reason, uid, details, sentProgress]);

  const handleBlock = useCallback(async () => {
    if (!target || !uid) return;
    setBlocking(true);
    setError(null);
    try {
      await blockUser(uid, target.ownerUid, queryClient);
      onClose();
    } catch {
      setError(`We couldn't block ${ownerName}. Try again.`);
    } finally {
      setBlocking(false);
    }
  }, [target, uid, queryClient, onClose, ownerName]);

  return (
    <Modal visible={!!target} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing['6'] }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>
                REPORT {noun.toUpperCase()}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={22} color={colors.text.secondary} weight="bold" />
              </TouchableOpacity>
            </View>

            {sent ? (
              <Animated.View
                style={[
                  styles.sent,
                  {
                    opacity: sentProgress,
                    transform: [{ scale: sentProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
                  },
                ]}
              >
                <View style={[styles.sentIcon, { backgroundColor: `${colors.brand.purple}1A` }]}>
                  <ShieldCheck size={30} color={colors.brand.purple} weight="duotone" />
                </View>
                <Text style={[styles.title, styles.centered, { color: colors.text.primary }]}>Thanks for telling us</Text>
                <Text style={[styles.body, styles.centered, { color: colors.text.secondary }]}>
                  We review every report within 24 hours. You won&apos;t see this {noun} again.
                </Text>

                <View style={styles.sentActions}>
                  {!isBlocked ? (
                    <Button
                      label={`Block ${ownerName}`}
                      variant="secondary"
                      size="lg"
                      fullWidth
                      loading={blocking}
                      disabled={blocking}
                      haptic="medium"
                      onPress={handleBlock}
                    />
                  ) : null}
                  <Button label="Done" variant="primary" size="lg" fullWidth haptic="light" onPress={onClose} />
                </View>
              </Animated.View>
            ) : (
              <>
                <Text style={[styles.title, { color: colors.text.primary }]}>
                  What&apos;s wrong with this {noun}?
                </Text>
                <Text style={[styles.body, { color: colors.text.secondary }]}>
                  Reports are private. {ownerName} won&apos;t know who sent it.
                </Text>

                <View
                  style={[styles.reasons, { borderColor: colors.background.cardBorder, backgroundColor: colors.background.card }]}
                  accessibilityRole="radiogroup"
                >
                  {REPORT_REASONS.map(({ id, label }, i) => {
                    const selected = reason === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => handleSelect(id)}
                        style={[
                          styles.reasonRow,
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.background.cardBorder },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.reasonLabel, { color: colors.text.primary }]}>{label}</Text>
                        {selected ? (
                          <CheckCircle size={22} color={colors.text.primary} weight="fill" />
                        ) : (
                          <CircleIcon size={22} color={colors.text.disabled} weight="regular" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.label, { color: colors.text.secondary }]}>Anything else we should know?</Text>
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Optional"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  maxLength={REPORT_DETAILS_MAX_LENGTH}
                  style={[
                    styles.details,
                    { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
                  ]}
                />

                <Button
                  label="Send report"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={sending}
                  disabled={!reason || sending}
                  onPress={handleSend}
                />
              </>
            )}

            {error ? (
              <Text style={[styles.error, { color: colors.semantic.error }]} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['4'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['2'],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.88,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.52,
    marginBottom: Spacing['2'],
  },
  body: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
    marginBottom: Spacing['5'],
  },
  reasons: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: Spacing['5'],
  },
  reasonRow: {
    minHeight: 52,
    paddingHorizontal: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reasonLabel: {
    fontSize: FontSize.base,
  },
  label: {
    fontSize: FontSize.sm,
    marginBottom: Spacing['2'],
  },
  details: {
    minHeight: 88,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing['3'],
    fontSize: FontSize.base,
    textAlignVertical: 'top',
    marginBottom: Spacing['5'],
  },
  sent: {
    paddingTop: Spacing['8'],
    alignItems: 'center',
  },
  sentIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['4'],
  },
  sentActions: {
    alignSelf: 'stretch',
    gap: Spacing['3'],
    marginTop: Spacing['3'],
  },
  centered: {
    textAlign: 'center',
  },
  error: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    marginTop: Spacing['3'],
  },
});
