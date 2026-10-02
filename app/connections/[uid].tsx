/**
 * A profile's Followers and Following lists — opened by tapping either count
 * on a profile (yours or someone else's), with a switch between the two.
 * Navigated to via router.push({ pathname: '/connections/[uid]', params: { uid, tab } }).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, UsersThree } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useConnections } from '@/hooks/useConnections';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonListRow } from '@/components/ui/Skeleton';
import { SPRING } from '@/constants/motion';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import type { ConnectionKind } from '@/utils/connections';
import type { UserProfile } from '@/types';

const TABS: { id: ConnectionKind; label: string }[] = [
  { id: 'followers', label: 'Followers' },
  { id: 'following', label: 'Following' },
];

export default function ConnectionsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uid: string; tab?: string }>();
  const uid = params.uid ?? '';
  const [tab, setTab] = useState<ConnectionKind>(params.tab === 'following' ? 'following' : 'followers');
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const isMe = uid === myUid;
  const { data: profile } = useUserProfile(uid);
  const { users, isLoading } = useConnections(uid, tab);

  // The list springs in on each switch.
  const listAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    listAnim.setValue(0);
    Animated.spring(listAnim, { toValue: 1, ...SPRING }).start();
  }, [tab, listAnim]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);
  const handleTab = useCallback((next: ConnectionKind) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTab(next);
  }, []);
  const findPeople = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/(tabs)/explore');
  }, []);

  const name = isMe ? 'you' : (profile?.fullName || 'this traveler');
  const renderItem = useCallback(({ item }: { item: UserProfile }) => <UserSuggestion user={item} />, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top + Spacing['2'] }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.back} accessibilityLabel="Back" hitSlop={6}>
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          {!isMe && profile?.username ? (
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>@{profile.username.toUpperCase()}</Text>
          ) : null}
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
            {isMe ? 'Your people' : profile?.fullName ?? ' '}
          </Text>
        </View>
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.background.sunken }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = t.id === 'followers' ? profile?.followersCount : profile?.followingCount;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => handleTab(t.id)}
              style={[styles.tab, active && { backgroundColor: colors.background.elevated }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, { color: active ? colors.text.primary : colors.text.secondary }]}>
                {count != null ? `${count} ${t.label}` : t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Animated.View style={[styles.fill, { opacity: listAnim, transform: [{ translateY: listAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
        {isLoading ? (
          <View style={styles.skeletons}>
            {[0, 1, 2, 3, 4].map((i) => <SkeletonListRow key={i} />)}
          </View>
        ) : users.length === 0 ? (
          <EmptyState
            icon={UsersThree}
            title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            description={tab === 'followers'
              ? `When people follow ${name}, they show up here.`
              : `When ${name === 'you' ? 'you follow' : `${name} follows`} someone, they show up here.`}
            actionLabel="Find people to follow"
            onAction={findPeople}
            actionHaptic="light"
            style={styles.empty}
          />
        ) : (
          <FlashList
            data={users}
            keyExtractor={(u) => u.uid}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: Spacing['5'], paddingBottom: insets.bottom + Spacing['8'] }}
            ItemSeparatorComponent={() => <View style={{ height: Spacing['4'] }} />}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['3'], gap: Spacing['1'], marginBottom: Spacing['4'] },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.08 * 11 },
  title: { fontSize: 26, fontWeight: FontWeight.semiBold, letterSpacing: -0.02 * 26 },
  tabs: { flexDirection: 'row', marginHorizontal: Spacing['5'], borderRadius: 12, padding: 3, marginBottom: Spacing['5'] },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  skeletons: { paddingHorizontal: Spacing['5'], gap: Spacing['4'] },
  empty: { marginTop: Spacing['8'] },
});
