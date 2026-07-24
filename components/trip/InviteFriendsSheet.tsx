/**
 * components/trip/InviteFriendsSheet.tsx
 *
 * "Invite friends" — request/accept, not instant-add: picking someone here
 * sends a pending trips/{id}/invites/{uid} doc + notification (inviteToTrip
 * Cloud Function); they only become a collaborator once they accept from
 * the notifications screen. Audience is the follow graph only (followers ∪
 * following) — reuses useFollowConnections + useAuthorProfiles (the batch
 * lookup built for TripCard authors) rather than a new user-search flow.
 *
 * Same floating bottom-sheet chrome as JournalSheet: Modal → backdrop →
 * BlurView(tint="dark", always — a frosted glass card reads consistently
 * whether the page under it is light chrome or the dark map) → content.
 * Uses an explicit `height`, not `maxHeight` — see JournalSheet's SHEET_HEIGHT
 * comment for why a FlashList inside a BlurView needs a resolved size.
 */

import React, { useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { UsersThree, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFollowConnections } from '@/hooks/useFollow';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useTripInvites, useInviteFriend } from '@/hooks/useTripInvites';
import { Avatar } from '@/components/ui/Avatar';
import type { ThemeColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.6;

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
  const ownUid = useAuthStore((s) => s.user?.uid ?? '');

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
    inviteFriend.mutate(uid);
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

      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <UsersThree size={22} color={colors.text.disabled} weight="duotone" />
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            Follow people to invite them on trips.
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
        <View style={styles.sheetWrap}>
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
    height: SHEET_HEIGHT,
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
