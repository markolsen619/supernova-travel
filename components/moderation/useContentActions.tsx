import React, { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, findNodeHandle, type View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/useAuthStore';
import { useModerationStore } from '@/stores/useModerationStore';
import { blockUser, unblockUser } from '@/services/moderation';
import { canModerate, type ReportTarget } from '@/utils/moderation';
import { ReportSheet, REPORT_NOUNS } from './ReportSheet';

interface OpenActionsOptions {
  target: ReportTarget;
  /** The owner's display name, for "Block Sam". */
  ownerName: string;
  /**
   * The button that opened the menu. On iPad an action sheet is a popover and
   * needs something to point at; without it, it floats mid-screen.
   */
  anchor?: React.RefObject<View | null>;
  /** An option listed above Report — e.g. "Delete comment" on a comment on your own post. */
  extraAction?: { label: string; destructive?: boolean; onPress: () => void };
}

/**
 * The "More options" menu for someone else's content: report it, or block
 * (or unblock) its owner. Returns the opener and the report sheet element,
 * which the calling screen renders once.
 *
 * Does nothing for your own content, so call sites don't need to check.
 */
export function useContentActions() {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [report, setReport] = useState<{ target: ReportTarget; ownerName: string } | null>(null);

  const closeReport = useCallback(() => setReport(null), []);

  const confirmBlock = useCallback(
    (ownerUid: string, ownerName: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        `Block ${ownerName}?`,
        "They won't be able to follow you, message you, or comment on your posts, and you won't see their posts, trips, or comments. We won't tell them.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => {
              blockUser(uid, ownerUid, queryClient).catch(() =>
                Alert.alert(`We couldn't block ${ownerName}`, 'Check your connection and try again.'),
              );
            },
          },
        ],
      );
    },
    [uid, queryClient],
  );

  const unblock = useCallback(
    (ownerUid: string, ownerName: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      unblockUser(uid, ownerUid, queryClient).catch(() =>
        Alert.alert(`We couldn't unblock ${ownerName}`, 'Check your connection and try again.'),
      );
    },
    [uid, queryClient],
  );

  const openActions = useCallback(
    ({ target, ownerName, anchor, extraAction }: OpenActionsOptions) => {
      if (!canModerate(uid, target.ownerUid)) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const isBlocked = useModerationStore.getState().blockedUids.includes(target.ownerUid);
      const reportLabel = `Report ${REPORT_NOUNS[target.type]}`;
      const blockLabel = isBlocked ? `Unblock ${ownerName}` : `Block ${ownerName}`;

      const onReport = () => setReport({ target, ownerName });
      const onBlockToggle = () =>
        isBlocked ? unblock(target.ownerUid, ownerName) : confirmBlock(target.ownerUid, ownerName);

      if (Platform.OS === 'ios') {
        const anchorHandle = anchor?.current ? findNodeHandle(anchor.current) : null;
        const offset = extraAction ? 1 : 0;
        const destructive = [
          ...(extraAction?.destructive ? [0] : []),
          ...(isBlocked ? [] : [1 + offset]),
        ];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: [...(extraAction ? [extraAction.label] : []), reportLabel, blockLabel, 'Cancel'],
            destructiveButtonIndex: destructive.length ? destructive : undefined,
            cancelButtonIndex: 2 + offset,
            ...(anchorHandle ? { anchor: anchorHandle } : {}),
          },
          (index) => {
            if (extraAction && index === 0) extraAction.onPress();
            if (index === offset) onReport();
            if (index === 1 + offset) onBlockToggle();
          },
        );
        return;
      }

      Alert.alert(ownerName, undefined, [
        ...(extraAction
          ? [{ text: extraAction.label, style: extraAction.destructive ? 'destructive' as const : 'default' as const, onPress: extraAction.onPress }]
          : []),
        { text: reportLabel, onPress: onReport },
        { text: blockLabel, style: isBlocked ? 'default' : 'destructive', onPress: onBlockToggle },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [uid, confirmBlock, unblock],
  );

  const reportSheet = (
    <ReportSheet target={report?.target ?? null} ownerName={report?.ownerName ?? ''} onClose={closeReport} />
  );

  return { openActions, reportSheet, confirmBlock, unblock };
}
