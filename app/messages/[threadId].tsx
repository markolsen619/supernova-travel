import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PaperPlaneRight, DotsThree, Prohibit } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { maybePromptForPush } from '@/services/push';
import { useDmThread } from '@/hooks/useDmThreads';
import { useDmMessages, useSendDmMessage } from '@/hooks/useDmMessages';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { EmptyState } from '@/components/ui/EmptyState';
import { useContentActions } from '@/components/moderation/useContentActions';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';
import { containsObjectionableText, OBJECTIONABLE_TEXT_MESSAGE } from '@/utils/contentFilter';
import { Avatar } from '@/components/ui/Avatar';
import { formatGroupName } from '@/utils/dm';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { DmMessage } from '@/types';

export default function DmThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const tier = useAuthStore((s) => s.tier);

  const { data: thread } = useDmThread(threadId ?? null);
  const { messages: allMessages, loading } = useDmMessages(threadId ?? null);
  const moderation = useModeration();
  const { openActions, reportSheet, unblock } = useContentActions();
  const headerMoreRef = useRef<View>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const messages = useMemo(
    () =>
      filterVisible(allMessages, moderation, (m) => ({
        authorUid: m.senderUid === myUid ? null : m.senderUid,
        key: contentKey({ type: 'message', id: m.id, parentId: threadId }),
      })),
    [allMessages, moderation, myUid, threadId],
  );
  const sendMessage = useSendDmMessage(threadId ?? null);
  const [text, setText] = useState('');
  const listRef = useRef<FlashListRef<DmMessage>>(null);

  const otherUids = useMemo(
    () => (thread ? thread.participants.filter((uid) => uid !== myUid) : []),
    [thread, myUid],
  );
  const { data: profiles = {} } = useAuthorProfiles(otherUids);

  const headerName = useMemo(() => {
    if (!thread) return '';
    if (thread.type === 'direct') return profiles[otherUids[0]]?.name ?? 'Traveler';
    return formatGroupName(otherUids.map((uid) => profiles[uid]?.name ?? 'Traveler'));
  }, [thread, otherUids, profiles]);

  // Mark my read cursor for this thread whenever it's open/focused.
  useFocusEffect(
    useCallback(() => {
      if (!threadId || !myUid) return;
      setDoc(doc(db, 'dmThreads', threadId, 'reads', myUid), { lastReadAt: serverTimestamp() }, { merge: true }).then(
        () => {
          queryClient.invalidateQueries({ queryKey: ['dmThreads'] });
          queryClient.invalidateQueries({ queryKey: ['hasUnreadActivity'] });
        },
      ).catch(() => {});
    }, [threadId, myUid, queryClient]),
  );

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const directOtherUid = thread?.type === 'direct' ? otherUids[0] : undefined;
  const directBlocked = !!directOtherUid && moderation.blockedUids.has(directOtherUid);

  const handleMessageMore = useCallback(
    (message: DmMessage, anchor: React.RefObject<View | null>) => {
      if (!threadId) return;
      openActions({
        target: { type: 'message', id: message.id, parentId: threadId, ownerUid: message.senderUid },
        ownerName: profiles[message.senderUid]?.name ?? 'this traveler',
        anchor,
      });
    },
    [threadId, openActions, profiles],
  );

  const handleHeaderMore = useCallback(() => {
    if (!directOtherUid) return;
    openActions({
      target: { type: 'user', id: directOtherUid, ownerUid: directOtherUid },
      ownerName: headerName || 'this traveler',
      anchor: headerMoreRef,
    });
  }, [directOtherUid, headerName, openActions]);

  const handleUnblock = useCallback(() => {
    if (directOtherUid) unblock(directOtherUid, headerName || 'this traveler');
  }, [directOtherUid, headerName, unblock]);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    if (containsObjectionableText(text)) {
      setSendError(OBJECTIONABLE_TEXT_MESSAGE);
      return;
    }
    setSendError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const toSend = text;
    setText('');
    // Two callbacks rather than .then().catch(): the prompt must not fire on
    // a send that failed, and a rejection here must still reach the revert.
    sendMessage(toSend).then(
      () => {
        // You've just sent something and are now waiting on a reply — the
        // moment notifications explain themselves.
        maybePromptForPush(myUid, tier, 'dm_sent');
      },
      () => {
        setText(toSend); // revert — the message wasn't actually sent
        // Includes the rules refusing a message to someone who blocked you.
        setSendError("Your message wasn't sent. Try again.");
      },
    );
  }, [text, sendMessage, myUid, tier]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing['3'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        {thread?.type === 'direct' ? (
          <Avatar uri={profiles[otherUids[0]]?.avatarUrl} name={headerName} size="sm" />
        ) : (
          <View style={[styles.groupAvatar, { backgroundColor: colors.background.sunken }]}>
            <Text style={{ color: colors.text.secondary, fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>
              {otherUids.length}
            </Text>
          </View>
        )}
        <Text style={[styles.headerName, { color: colors.text.primary }]} numberOfLines={1}>
          {headerName}
        </Text>
        {directOtherUid ? (
          <TouchableOpacity
            ref={headerMoreRef}
            onPress={handleHeaderMore}
            style={styles.moreBtn}
            accessibilityLabel={`More options for ${headerName || 'this conversation'}`}
          >
            <DotsThree size={22} color={colors.text.primary} weight="bold" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {directBlocked ? (
        <View style={styles.blocked}>
          <EmptyState
            icon={Prohibit}
            title={`You blocked ${headerName || 'this traveler'}`}
            description="Unblock them to see this conversation and message each other again."
            actionLabel="Unblock"
            onAction={handleUnblock}
            actionHaptic="none"
          />
        </View>
      ) : null}

      {!loading && !directBlocked && (
        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMine={item.senderUid === myUid}
              senderName={thread?.type === 'group' ? profiles[item.senderUid]?.name : undefined}
              onMore={handleMessageMore}
            />
          )}
        />
      )}

      {sendError && !directBlocked ? (
        <Text style={[styles.sendError, { color: colors.semantic.error }]} accessibilityLiveRegion="polite">
          {sendError}
        </Text>
      ) : null}
      {!directBlocked && (
      <View style={[styles.composer, { borderTopColor: colors.background.cardBorder, paddingBottom: insets.bottom + Spacing['3'] }]}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (sendError) setSendError(null);
          }}
          placeholder="Message"
          placeholderTextColor={colors.text.tertiary}
          style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.sunken }]}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim()}
          style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.text.primary : colors.background.sunken }]}
          accessibilityLabel="Send message"
        >
          <PaperPlaneRight size={18} color={text.trim() ? colors.background.primary : colors.text.disabled} weight="fill" />
        </TouchableOpacity>
      </View>
      )}
      {reportSheet}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, minHeight: 32, alignItems: 'flex-start', justifyContent: 'center' },
  moreBtn: { width: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  blocked: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing['5'] },
  sendError: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.5, paddingHorizontal: Spacing['5'], paddingTop: Spacing['2'] },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerName: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.xl,
    fontSize: FontSize.sm,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
