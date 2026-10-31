/**
 * Home for a new account with no trips (spec 2026-10-30): on iPhone the store can't carry an invite through the
 * install, so this offers to paste the link. The clipboard is read only when they tap.
 */
import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { parseInviteToken } from '@/utils/inviteLinks';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const PasteInviteCard = memo(function PasteInviteCard() {
  const { colors } = useTheme();
  const [notALink, setNotALink] = useState(false);
  const paste = useCallback(async () => {
    const token = parseInviteToken(await Clipboard.getStringAsync().catch(() => ''));
    setNotALink(!token);
    if (token) router.push(`/join/${token}` as never);
  }, []);
  return (
    <View style={[styles.card, { backgroundColor: colors.background.card }]}>
      <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>GOT AN INVITE?</Text>
      <Text style={[styles.title, { color: colors.text.primary }]}>Joining a friend's trip?</Text>
      <Text style={[styles.body, { color: notALink ? colors.semantic.error : colors.text.secondary }]}>
        {notALink
          ? "That isn't a Supernova invite link. Copy the whole link and try again."
          : 'Copy the invite link from your messages, then paste it here.'}
      </Text>
      <Button label="Paste invite link" variant="secondary" onPress={paste} fullWidth style={styles.btn} />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, padding: Spacing['5'], gap: Spacing['2'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, letterSpacing: -0.3 },
  body: { fontSize: FontSize.base, lineHeight: 22 },
  btn: { marginTop: Spacing['2'] },
});
