import { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ArrowLeft, Compass, Check, X, ChatCircleDots, Plus } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotifications, useMarkNotificationsRead } from '@/hooks/useNotifications';
import { useRespondToInvite } from '@/hooks/useTripInvites';
import { useDmThreads } from '@/hooks/useDmThreads';
import { useMarkMessagesSeen } from '@/hooks/useUnreadActivity';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { FriendPickerSheet } from '@/components/messages/FriendPickerSheet';
import { formatGroupName } from '@/utils/dm';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonListRow } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { AppNotification } from '@/types';

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data: notifications = [], isLoading } = useNotifications();
  const respond = useRespondToInvite();
  // Local-only, this-session tracking of which invites were just actioned —
  // the notification doc itself doesn't carry a "handled" field (that would
  // need its own write path from the client, which notifications' write:
  // false rule doesn't allow), so this is purely a UI state flip pending the
  // next real fetch.
  const [handled, setHandled] = useState<Record<string, 'accepted' | 'declined'>>({});

  const [tab, setTab] = useState<'Activity' | 'Messages'>('Activity');
  const [pickerVisible, setPickerVisible] = useState(false);
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const markRead = useMarkNotificationsRead();
  const { data: threads = [], isLoading: threadsLoading } = useDmThreads();
  const markMessagesSeen = useMarkMessagesSeen();

  const allOtherUids = Array.from(
    new Set(threads.flatMap((t) => t.participants.filter((uid) => uid !== myUid))),
  );
  const { data: profiles = {} } = useAuthorProfiles(allOtherUids);

  // Batch-mark unread notifications read once they've actually loaded and
  // been shown, not on every render.
  useEffect(() => {
    if (tab === 'Activity' && notifications.some((n) => !n.read)) {
      markRead.mutate();
    }
  }, [tab, notifications]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'Messages') {
      markMessagesSeen.mutate();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleThreadPress = useCallback((threadId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/messages/${threadId}`);
  }, []);

  const handleOpenPicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerVisible(true);
  }, []);

  const handleThreadCreated = useCallback((threadId: string) => {
    setPickerVisible(false);
    router.push(`/messages/${threadId}`);
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleRespond = useCallback(
    (notif: AppNotification & { type: 'trip_invite' }, accept: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setHandled((prev) => ({ ...prev, [notif.id]: accept ? 'accepted' : 'declined' }));
      respond.mutate(
        { tripId: notif.tripId, accept },
        {
          onError: () => setHandled((prev) => { const next = { ...prev }; delete next[notif.id]; return next; }),
        },
      );
    },
    [respond],
  );

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => {
      if (item.type === 'trip_invite') {
        const result = handled[item.id];
        return (
          <View style={[styles.row, { borderColor: colors.background.cardBorder }]}>
            <Avatar uri={item.inviterAvatarUrl} name={item.inviterName} size="sm" />
            <View style={styles.rowText}>
              <Text style={[styles.rowBody, { color: colors.text.primary }]}>
                <Text style={styles.rowBold}>{item.inviterName}</Text> invited you to {item.tripTitle}
              </Text>
              <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>
                {timeAgo(item.createdAt.toDate())}
              </Text>
              {result ? (
                <Text style={[styles.resultText, { color: colors.text.tertiary }]}>
                  {result === 'accepted' ? "You're on the trip" : 'Declined'}
                </Text>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => handleRespond(item as AppNotification & { type: 'trip_invite' }, true)}
                    style={[styles.acceptBtn, { backgroundColor: colors.brand.purple }]}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityLabel="Accept invite"
                  >
                    <Check size={14} color="#ffffff" weight="bold" />
                    <Text style={styles.acceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRespond(item as AppNotification & { type: 'trip_invite' }, false)}
                    style={[styles.declineBtn, { backgroundColor: colors.background.sunken }]}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityLabel="Decline invite"
                  >
                    <X size={14} color={colors.text.secondary} weight="bold" />
                    <Text style={[styles.declineText, { color: colors.text.secondary }]}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );
      }

      if (item.type === 'post_like') {
        return (
          <TouchableOpacity
            style={[styles.row, { borderColor: colors.background.cardBorder }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/post/${item.postId}`);
            }}
            activeOpacity={0.7}
          >
            <Avatar uri={item.likerAvatarUrl} name={item.likerName} size="sm" />
            <View style={styles.rowText}>
              <Text style={[styles.rowBody, { color: colors.text.primary }]}>
                <Text style={styles.rowBold}>{item.likerName}</Text> liked your post
              </Text>
              <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>
                {timeAgo(item.createdAt.toDate())}
              </Text>
            </View>
            {item.postCoverUrl ? <Image source={{ uri: item.postCoverUrl }} style={styles.postThumb} /> : null}
          </TouchableOpacity>
        );
      }

      if (item.type === 'post_comment') {
        return (
          <TouchableOpacity
            style={[styles.row, { borderColor: colors.background.cardBorder }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/post/${item.postId}`);
            }}
            activeOpacity={0.7}
          >
            <Avatar uri={item.commenterAvatarUrl} name={item.commenterName} size="sm" />
            <View style={styles.rowText}>
              <Text style={[styles.rowBody, { color: colors.text.primary }]}>
                <Text style={styles.rowBold}>{item.commenterName}</Text> commented: {item.commentText}
              </Text>
              <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>
                {timeAgo(item.createdAt.toDate())}
              </Text>
            </View>
            {item.postCoverUrl ? <Image source={{ uri: item.postCoverUrl }} style={styles.postThumb} /> : null}
          </TouchableOpacity>
        );
      }

      // trip_invite_accepted
      return (
        <TouchableOpacity
          style={[styles.row, { borderColor: colors.background.cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/trip/${item.tripId}`);
          }}
          activeOpacity={0.7}
        >
          <Avatar uri={item.accepterAvatarUrl} name={item.accepterName} size="sm" />
          <View style={styles.rowText}>
            <Text style={[styles.rowBody, { color: colors.text.primary }]}>
              <Text style={styles.rowBold}>{item.accepterName}</Text> joined {item.tripTitle}
            </Text>
            <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>
              {timeAgo(item.createdAt.toDate())}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, handled, handleRespond],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Activity</Text>
        {tab === 'Messages' ? (
          <TouchableOpacity onPress={handleOpenPicker} style={styles.backBtn} hitSlop={8} accessibilityLabel="New message">
            <Plus size={20} color={colors.text.primary} weight="bold" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <View style={styles.tabRow}>
        {(['Activity', 'Messages'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTab(t);
            }}
            style={[
              styles.tabPill,
              {
                backgroundColor: tab === t ? colors.brand.purple + '1A' : 'transparent',
                borderColor: tab === t ? colors.brand.purple : colors.background.cardBorder,
              },
            ]}
          >
            <Text style={[styles.tabPillText, { color: tab === t ? colors.brand.purple : colors.text.tertiary }]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'Activity' ? (
        isLoading ? (
          <View style={styles.list}>
            {[0, 1, 2].map((i) => <SkeletonListRow key={i} />)}
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon={Bell}
              title="Your activity lives here"
              description="Likes, comments, and trip invites from other travelers will appear here."
              actionLabel="Find travelers to follow"
              actionIcon={Compass}
              onAction={() => router.navigate('/(tabs)/explore')}
              actionHaptic="light"
            />
          </View>
        ) : (
          <FlashList
            data={notifications}
            keyExtractor={(n) => n.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: insets.bottom + Spacing['6'] }}
          />
        )
      ) : threadsLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <SkeletonListRow key={i} />)}
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon={ChatCircleDots}
            title="No messages yet"
            description="Start a conversation with a friend who follows you back."
            actionLabel="New message"
            onAction={handleOpenPicker}
            actionHaptic="light"
          />
        </View>
      ) : (
        <FlashList
          data={threads}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: insets.bottom + Spacing['6'] }}
          renderItem={({ item }) => {
            const otherUids = item.participants.filter((uid) => uid !== myUid);
            const name =
              item.type === 'direct'
                ? profiles[otherUids[0]]?.name ?? 'Traveler'
                : formatGroupName(otherUids.map((uid) => profiles[uid]?.name ?? 'Traveler'));
            return (
              <TouchableOpacity
                style={[styles.row, { borderColor: colors.background.cardBorder }]}
                onPress={() => handleThreadPress(item.id)}
                activeOpacity={0.7}
              >
                <Avatar uri={item.type === 'direct' ? profiles[otherUids[0]]?.avatarUrl : null} name={name} size="sm" />
                <View style={styles.rowText}>
                  <Text style={[styles.rowBody, { color: colors.text.primary, fontWeight: item.unread ? FontWeight.bold : FontWeight.regular }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.rowTime, { color: colors.text.tertiary }]} numberOfLines={1}>
                    {item.lastMessageText ?? 'Say hello'}
                  </Text>
                </View>
                {item.lastMessageAt && (
                  <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>
                    {timeAgo(item.lastMessageAt.toDate())}
                  </Text>
                )}
                {item.unread && <View style={[styles.unreadDot, { backgroundColor: colors.brand.purple }]} />}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <FriendPickerSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} onCreated={handleThreadCreated} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['8'],
  },
  list: {
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['2'],
  },
  row: {
    flexDirection: 'row',
    gap: Spacing['3'],
    paddingVertical: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  rowBody: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.4 },
  rowBold: { fontWeight: FontWeight.semiBold },
  rowTime: { fontSize: FontSize.xs },
  postThumb: { width: 40, height: 40, borderRadius: BorderRadius.sm },
  resultText: { fontSize: FontSize.xs, marginTop: Spacing['1'] },
  actionRow: { flexDirection: 'row', gap: Spacing['2'], marginTop: Spacing['2'] },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
  },
  acceptText: { color: '#ffffff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
  },
  declineText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  tabPill: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabPillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: 'center',
  },
});
