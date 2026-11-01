/**
 * components/trip/InviteFriendsSheet.tsx
 *
 * "Invite friends". On top, Invite with a link (spec 2026-10-30-trip-invite-links-design.md): a single-use link
 * shared through the system sheet (Messages, Mail…) for someone who may not have Supernova yet.
 * Below, friends in the app — request/accept, not instant-add: picking someone here
 * sends a pending trips/{id}/invites/{uid} doc + notification (inviteToTrip
 * Cloud Function); they only become a collaborator once they accept from
 * the notifications screen. Audience is the follow graph only (followers ∪
 * following) — reuses useFollowConnections + useAuthorProfiles (the batch
 * lookup built for TripCard authors) rather than a new user-search flow.
 *
 * Same floating bottom-sheet chrome as JournalSheet: Modal → backdrop →
 * BlurView(tint="dark", always — a frosted glass card reads consistently
 * whether the page under it is light chrome or the dark map) → content.
 * Uses an explicit `height`, not `maxHeight` — see JournalSheet's sheetHeight
 * comment for why a FlashList inside a BlurView needs a resolved size.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinkSimple, UsersThree, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { useAuthStore } from '@/stores/useAuthStore';
import { maybePromptForPush } from '@/services/push';
import { useFollowConnections } from '@/hooks/useFollow';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useTripInvites, useInviteFriend } from '@/hooks/useTripInvites';
import { useInviteLinks } from '@/hooks/useInviteLinks';
import { Avatar } from '@/components/ui/Avatar';
import type { ThemeColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface InviteFriendsSheetProps {
  visible: boolean;
  tripId: string;
  collaborators: string[];
  onClose: () => void;
  /** Override for the map's always-dark context — see JournalSheet. */
  colors?: ThemeColors;
}

interface Row {
  uid: string;
  name: string;
  avatarUrl: string | null;
  status: 'invitable' | 'pending';
}

export function InviteFriendsSheet({ visible, tripId, collaborators, onClose, colors: colorsOverride }: InviteFriendsSheetProps) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const { height } = useLayout();
  const sheetHeight = height * 0.6;
  const ownUid = useAuthStore((s) => s.user?.uid ?? '');
  const tier = useAuthStore((s) => s.tier);

  const { data: connectionUids = [] } = useFollowConnections(visible ? ownUid : null);
  const candidateUids = useMemo(
    () => connectionUids.filter((uid) => !collaborators.includes(uid)),
    [connectionUids, collaborators],
  );
  const { data: profiles = {} } = useAuthorProfiles(candidateUids);
  const { data: invites = [] } = useTripInvites(visible ? tripId : null);
  const pendingUids = useMemo(
    () => new Set(invites.filter((i) => i.status === 'pending').map((i) => i.id)),
    [invites],
  );
  const inviteFriend = useInviteFriend(tripId);
  const links = useInviteLinks(tripId, visible);
  const [linkError, setLinkError] = useState(false);

  const handleShareLink = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLinkError(false);
    try {
      await links.shareLink();
    } catch {
      setLinkError(true);
    }
  }, [links]);

  const handleCancelLinks = useCallback(() => {
    Alert.alert('Cancel invite links?', "Anyone who hasn't joined yet won't be able to.", [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel links', style: 'destructive', onPress: () => { links.cancelAll().catch(() => setLinkError(true)); } },
    ]);
  }, [links]);

  const rows: Row[] = useMemo(
    () =>
      candidateUids
        .map((uid) => ({
          uid,
          name: profiles[uid]?.name ?? 'Traveler',
          avatarUrl: profiles[uid]?.avatarUrl ?? null,
          status: (pendingUids.has(uid) ? 'pending' : 'invitable') as Row['status'],
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [candidateUids, profiles, pendingUids],
  );

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleInvite = (uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    inviteFriend.mutate(uid, {
      // Receiving an invite happens server-side; sending one is the closest
      // client-side moment where a reply is expected.
      onSuccess: () => maybePromptForPush(ownUid, tier, 'trip_invite_sent'),
    });
  };

  const sheetContent = (
    <View style={styles.content}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.brand.purple }]}>INVITE</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>Bring a friend along</Text>
        </View>
        <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
          <X size={20} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={handleShareLink}
        disabled={links.sharing}
        style={styles.linkBtn}
        accessibilityRole="button"
        accessibilityLabel="Invite with a link"
      >
        {links.sharing ? <ActivityIndicator color="#1F1C19" /> : <LinkSimple size={18} color="#1F1C19" weight="bold" />}
        <Text style={styles.linkBtnText}>Invite with a link</Text>
      </TouchableOpacity>
      <Text style={[styles.linkNote, { color: linkError ? colors.semantic.error : colors.text.tertiary }]}>
        {linkError ? "Couldn't make a link. Check your connection and try again." : 'Works once, for one person, for 30 days.'}
      </Text>
      {links.openCount > 0 ? (
        <View style={styles.waitingRow}>
          <Text style={[styles.waitingText, { color: colors.text.secondary }]}>
            {`${links.openCount} ${links.openCount === 1 ? 'link' : 'links'} waiting`}
          </Text>
          <TouchableOpacity onPress={handleCancelLinks} style={styles.cancelBtn} accessibilityRole="button" accessibilityLabel="Cancel waiting invite links">
            <Text style={[styles.cancelText, { color: colors.text.primary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[styles.eyebrow, styles.sectionEyebrow, { color: colors.text.tertiary }]}>FRIENDS ON SUPERNOVA</Text>
      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <UsersThree size={22} color={colors.text.disabled} weight="duotone" />
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            Follow people to invite them here, or send a link.
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: colors.background.cardBorder }]}>
              <Avatar uri={item.avatarUrl} name={item.name} size="sm" />
              <Text style={[styles.rowText, { color: colors.text.primary }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.status === 'pending' ? (
                <View style={styles.pendingPill}>
                  <Text style={[styles.pendingText, { color: colors.text.tertiary }]}>Invited</Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => handleInvite(item.uid)}
                  disabled={inviteFriend.isPending}
                  style={[styles.inviteBtn, { backgroundColor: colors.brand.purple }]}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityLabel={`Invite ${item.name}`}
                >
                  <Text style={styles.inviteBtnText}>Invite</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.sheetWrap, { height: sheetHeight }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={90} tint="dark" style={styles.fill}>
              {sheetContent}
            </BlurView>
          ) : (
            <View style={[styles.fill, styles.androidBg]}>{sheetContent}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  androidBg: { backgroundColor: 'rgba(10,10,26,0.97)' },

  content: { flex: 1, padding: Spacing['5'], gap: Spacing['3'] },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing['1'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing['3'] },
  headerText: { flex: 1 },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
    marginBottom: 2,
  },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  linkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'],
    minHeight: 50, borderRadius: BorderRadius.md, backgroundColor: '#FBF9F5', marginTop: Spacing['1'],
  },
  linkBtnText: { color: '#1F1C19', fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  linkNote: { fontSize: FontSize.sm, textAlign: 'center' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['1'] },
  waitingText: { fontSize: FontSize.sm },
  cancelBtn: { minHeight: 44, paddingHorizontal: Spacing['2'], justifyContent: 'center' },
  cancelText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, textDecorationLine: 'underline' },
  sectionEyebrow: { marginTop: Spacing['2'], marginBottom: 0 },

  emptyRow: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing['2'], paddingHorizontal: Spacing['8'] },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center' },

  listContent: { paddingTop: Spacing['1'], paddingBottom: Spacing['4'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing['3'],
  },
  rowText: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  inviteBtn: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
  },
  inviteBtnText: {
    color: '#ffffff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  pendingPill: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  pendingText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
