import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ArrowLeft, Compass, Check, X } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useNotifications } from '@/hooks/useNotifications';
import { useRespondToInvite } from '@/hooks/useTripInvites';
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
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <SkeletonListRow key={i} />)}
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon={Bell}
            title="Your activity lives here"
            description="Trip invites and updates from other travelers will appear here."
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
      )}
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
});
