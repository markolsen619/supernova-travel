import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Share,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Check, Export, UsersThree, X, MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDmThreads } from '@/hooks/useDmThreads';
import { useMutualFriends } from '@/hooks/useMutualFriends';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useModeration } from '@/hooks/useModeration';
import { useShareTrip } from '@/hooks/useShareTrip';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import { containsObjectionableText, OBJECTIONABLE_TEXT_MESSAGE } from '@/utils/contentFilter';
import { shareRecipients, tripShareUrl, type ShareableTrip } from '@/utils/tripShare';
import { tripPlaceLabel } from '@/utils/tripRegion';

interface ShareTripSheetProps {
  visible: boolean;
  trip: ShareableTrip;
  onClose: () => void;
}

/** Share a trip: send it to people you can message, or share its link. */
export function ShareTripSheet({ visible, trip, onClose }: ShareTripSheetProps) {
  const { colors } = useTheme();
  const { isLarge } = useLayout();
  const me = useAuthStore((s) => s.user?.uid ?? '');
  // Nothing loads until the sheet opens: it is mounted on every trip page.
  const { data: threads = [], isLoading: threadsLoading } = useDmThreads(visible);
  const { data: friendUids = [], isLoading: friendsLoading } = useMutualFriends(visible ? me : null);
  const loadingRecipients = threadsLoading || friendsLoading;
  const { blockedUids } = useModeration();
  const recipients = useMemo(
    () => shareRecipients(threads, friendUids, me, blockedUids),
    [threads, friendUids, me, blockedUids],
  );
  const { data: profiles = {} } = useAuthorProfiles(recipients.map((r) => r.uid));
  const { send, sending } = useShareTrip();

  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{
    message: string;
    failed: boolean;
  } | null>(null);
  const resultAnim = useRef(new Animated.Value(0)).current;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setSelected([]);
    setNote('');
    setResult(null);
    resultAnim.setValue(0);
  }, [resultAnim]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const handleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reset();
    onClose();
  }, [onClose, reset]);

  const toggle = useCallback((uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setResult(null);
    setSelected((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  }, []);

  const showResult = useCallback(
    (message: string, failed: boolean) => {
      setResult({ message, failed });
      resultAnim.setValue(0);
      Animated.spring(resultAnim, { toValue: 1, ...SPRING }).start();
    },
    [resultAnim],
  );

  const handleSend = useCallback(async () => {
    if (selected.length === 0 || sending) return;
    if (note.trim() && containsObjectionableText(note)) {
      showResult(OBJECTIONABLE_TEXT_MESSAGE, true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const chosen = recipients
      .filter((r) => selected.includes(r.uid))
      .map((r) => ({ ...r, name: profiles[r.uid]?.name ?? 'Traveler' }));
    const summary = await send(chosen, trip, note);
    const failed = summary.failedNames.length > 0;
    showResult(summary.message, failed);
    if (failed) {
      // Keep only the people it missed selected, so Send retries just them.
      setSelected(summary.failedUids);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeTimer.current = setTimeout(() => {
      reset();
      onClose();
    }, 1200);
  }, [selected, sending, note, recipients, profiles, send, trip, showResult, reset, onClose]);

  const handleShareLink = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `${trip.title} on Supernova ${tripShareUrl(trip.id)}`,
        url: tripShareUrl(trip.id),
      });
    } catch (err) {
      console.warn('share link failed', err);
    }
  }, [trip.id, trip.title]);

  const placeLabel = tripPlaceLabel(trip);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      {/* Lifts the note and Send above the keyboard (Rule 14: sheets keep a KeyboardAvoidingView). */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: colors.background.primary }]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Share trip</Text>
          <TouchableOpacity onPress={handleClose} style={styles.iconBtn} accessibilityLabel="Close">
            <X size={20} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* The trip being shared */}
        <View style={[styles.tripCard, { backgroundColor: colors.background.elevated }]}>
          {trip.coverImageUrl ? (
            <Image source={{ uri: trip.coverImageUrl }} style={styles.tripCover} contentFit="cover" />
          ) : (
            <View style={[styles.tripCover, styles.coverFallback, { backgroundColor: colors.background.sunken }]}>
              <MapPin size={20} color={colors.text.disabled} weight="duotone" />
            </View>
          )}
          <View style={styles.tripText}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>
              {placeLabel.toUpperCase()}
            </Text>
            <Text style={[styles.tripTitle, { color: colors.text.primary }]} numberOfLines={2}>
              {trip.title}
            </Text>
          </View>
        </View>

        {/* With no one to message, the empty state below offers this instead. */}
        {recipients.length > 0 && (
          <TouchableOpacity
            onPress={handleShareLink}
            style={[styles.linkRow, { borderColor: colors.background.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel="Share link"
          >
            <Export size={18} color={colors.text.primary} weight="bold" />
            <Text style={[styles.linkText, { color: colors.text.primary }]}>Share link</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionEyebrow, { color: colors.text.tertiary }]}>SEND IN SUPERNOVA</Text>

        {loadingRecipients ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text.tertiary} />
          </View>
        ) : recipients.length === 0 ? (
          <EmptyState
            icon={UsersThree}
            title="No one to message yet"
            description="You can message people you follow who follow you back. Share the link instead."
            actionLabel="Share link"
            onAction={handleShareLink}
            actionHaptic="light"
            size="sm"
          />
        ) : (
          <>
            <View style={styles.list}>
              <FlashList
                data={recipients}
                keyExtractor={(r) => r.uid}
                extraData={selected}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const name = profiles[item.uid]?.name ?? 'Traveler';
                  const isSelected = selected.includes(item.uid);
                  return (
                    <TouchableOpacity
                      style={[styles.row, { borderColor: colors.background.cardBorder }]}
                      onPress={() => toggle(item.uid)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={name}
                    >
                      <Avatar uri={profiles[item.uid]?.avatarUrl ?? undefined} name={name} size="sm" />
                      <Text style={[styles.rowText, { color: colors.text.primary }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <View
                        style={[
                          styles.check,
                          isSelected
                            ? {
                                backgroundColor: colors.text.primary,
                                borderColor: colors.text.primary,
                              }
                            : { borderColor: colors.background.cardBorder },
                        ]}
                      >
                        {isSelected && <Check size={12} color={colors.background.primary} weight="bold" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note"
              placeholderTextColor={colors.text.tertiary}
              maxLength={1000}
              multiline
              style={[
                styles.note,
                {
                  color: colors.text.primary,
                  backgroundColor: colors.background.sunken,
                },
              ]}
            />

            {result && (
              <Animated.Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.result,
                  {
                    color: result.failed ? colors.semantic.error : colors.text.secondary,
                    opacity: resultAnim,
                  },
                ]}
              >
                {result.message}
              </Animated.Text>
            )}

            <TouchableOpacity
              onPress={handleSend}
              disabled={selected.length === 0 || sending}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: colors.text.primary,
                  opacity: selected.length === 0 ? 0.35 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={selected.length > 1 ? `Send to ${selected.length} people` : 'Send'}
            >
              {sending ? (
                <ActivityIndicator color={colors.background.primary} />
              ) : (
                <Text style={[styles.sendText, { color: colors.background.primary }]}>
                  {selected.length > 1 ? `Send to ${selected.length} people` : 'Send'}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
        {isLarge ? null : <View style={styles.bottomPad} />}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Spacing['2'],
  },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginTop: Spacing['4'],
    padding: Spacing['3'],
    borderRadius: BorderRadius.xl,
  },
  tripCover: { width: 64, height: 64, borderRadius: BorderRadius.lg },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  tripText: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  tripTitle: { fontSize: 17, fontWeight: FontWeight.medium },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    minHeight: 52,
    marginTop: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkText: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.9,
    marginTop: Spacing['6'],
    marginBottom: Spacing['2'],
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.medium },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    marginTop: Spacing['3'],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['3'],
    minHeight: 48,
    maxHeight: 110,
    fontSize: FontSize.md,
  },
  result: { marginTop: Spacing['3'], fontSize: 13, textAlign: 'center' },
  sendBtn: {
    marginTop: Spacing['3'],
    minHeight: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  bottomPad: { height: Spacing['6'] },
  loading: { paddingVertical: Spacing['8'], alignItems: 'center' },
});
