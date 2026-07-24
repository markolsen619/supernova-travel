import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PaperPlaneRight } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDmThread } from '@/hooks/useDmThreads';
import { useDmMessages, useSendDmMessage } from '@/hooks/useDmMessages';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { MessageBubble } from '@/components/messages/MessageBubble';
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

  const { data: thread } = useDmThread(threadId ?? null);
  const { messages, loading } = useDmMessages(threadId ?? null);
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
      );
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

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sendMessage(text);
    setText('');
  }, [text, sendMessage]);

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
        <View style={styles.backBtn} />
      </View>

      {!loading && (
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
            />
          )}
        />
      )}

      <View style={[styles.composer, { borderTopColor: colors.background.cardBorder, paddingBottom: insets.bottom + Spacing['3'] }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.text.tertiary}
          style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.sunken }]}
          multiline
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
