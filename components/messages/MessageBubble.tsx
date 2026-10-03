import { bubbleColors } from '@/utils/messageBubble';
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { DmMessage } from '@/types';
import { TripMessageCard } from '@/components/messages/TripMessageCard';
import { tripNoteText } from '@/utils/tripShare';

interface MessageBubbleProps {
  message: DmMessage;
  isMine: boolean;
  /** Shown above the bubble only in group threads, where "the other
   * person" is ambiguous with 2+ other participants. Omit for direct
   * threads. */
  senderName?: string;
  /** Someone else's message only: opens report/block. Long-press, or the VoiceOver action. */
  onMore?: (message: DmMessage, anchor: React.RefObject<View | null>) => void;
}

export function MessageBubble({ message, isMine, senderName, onMore }: MessageBubbleProps) {
  const { colors } = useTheme();
  const bubbleRef = React.useRef<View>(null);
  const canMore = !isMine && !!onMore;
  const bubble = bubbleColors(isMine, colors);
  const handleMore = React.useCallback(() => onMore?.(message, bubbleRef), [onMore, message]);
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      {!!senderName && !isMine && (
        <Text style={[styles.senderName, { color: colors.text.tertiary }]}>{senderName}</Text>
      )}
      {message.trip && (
        <View
          // With no note bubble, the card anchors the report/block menu.
          ref={message.trip.note ? undefined : bubbleRef}
          style={[styles.tripCard, isMine ? styles.rowMine : styles.rowTheirs]}
        >
          <TripMessageCard trip={message.trip} onMore={canMore ? handleMore : undefined} />
        </View>
      )}
      {(!message.trip || message.trip.note) && (
        <Pressable
          ref={bubbleRef}
          onLongPress={canMore ? handleMore : undefined}
          delayLongPress={350}
          disabled={!canMore}
          accessibilityActions={canMore ? [{ name: 'report', label: 'Report or block' }] : undefined}
          onAccessibilityAction={canMore ? handleMore : undefined}
          style={[
            styles.bubble,
            { backgroundColor: bubble.background },
            isMine ? { borderBottomRightRadius: BorderRadius.sm } : { borderBottomLeftRadius: BorderRadius.sm },
          ]}
        >
          <Text style={{ color: bubble.text, fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.4 }}>
            {message.trip ? tripNoteText({ text: message.text, trip: message.trip }) : message.text}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    maxWidth: '78%',
    marginVertical: Spacing['1'],
  },
  rowMine: {
    alignSelf: 'flex-end',
  },
  rowTheirs: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginBottom: 2,
    marginLeft: Spacing['2'],
  },
  tripCard: {
    marginBottom: Spacing['1'],
  },
  bubble: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.lg,
  },
});
