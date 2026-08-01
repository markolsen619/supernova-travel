/**
 * app/user/[uid].tsx
 *
 * Full-screen public profile for any user.
 * Navigated to via router.push('/user/<uid>') — not part of the tab bar.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { MapPin, Bag, ArrowLeft, UserCircle, ChatCircleDots } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { useFollow } from '@/hooks/useFollow';
import { useTripList } from '@/hooks/useTripList';
import { useIsFriend } from '@/hooks/useIsFriend';
import { useCreateDmThread } from '@/hooks/useDmThreads';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonBlock, SkeletonText } from '@/components/ui/Skeleton';
import { PostsGrid } from '@/components/profile/PostsGrid';
import { TripsGrid } from '@/components/profile/TripsGrid';
import { SavedGrid } from '@/components/profile/SavedGrid';
import { EditProfileSheet } from '@/components/profile/EditProfileSheet';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type ProfileTab = 'Posts' | 'Trips' | 'Saved';
const PROFILE_TABS: ProfileTab[] = ['Posts', 'Trips', 'Saved'];

export default function UserProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { profile, isLoading, isFollowing, isOwnProfile } = usePublicProfile(uid ?? null);
  const { follow, unfollow } = useFollow(uid ?? '');
  const { data: trips = [] } = useTripList(uid ?? null);
  const { data: isFriend = false } = useIsFriend(uid ?? null);
  const createThread = useCreateDmThread();

  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>('Trips');
  const [editVisible, setEditVisible] = useState(false);

  // Filter trips based on ownership — own profile sees all, others see public only
  const publicTrips = isOwnProfile
    ? trips
    : trips.filter((t) => t.visibility === 'public');

  // Every trip on this screen belongs to this one profile — no batch lookup
  // needed, just this already-loaded profile keyed by its own uid.
  const authorProfiles = useMemo(
    () => (uid && profile ? { [uid]: { name: profile.fullName, avatarUrl: profile.avatarUrl } } : {}),
    [uid, profile],
  );

  // No manual haptic here — Button's variant="primary" default (medium)
  // covers it; a second call here would double-buzz.
  const handleFollow = useCallback(() => {
    follow.mutate();
  }, [follow]);

  const handleUnfollow = useCallback(() => {
    unfollow.mutate();
  }, [unfollow]);

  const handleMessage = useCallback(() => {
    if (!uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createThread.mutate([uid], {
      onSuccess: (result) => router.push(`/messages/${result.threadId}`),
    });
  }, [uid, createThread]);

  const handleEditProfileOpen = useCallback(() => {
    setEditVisible(true);
  }, []);

  const handleEditProfileClose = useCallback(() => {
    setEditVisible(false);
  }, []);

  const handleWalletPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(wallet)');
  }, []);

  const handleTripPress = useCallback(
    (id: string) => {
      router.push(`/trip/${id}`);
    },
    [],
  );

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleTabPress = useCallback((tab: ProfileTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveProfileTab(tab);
  }, []);

  // ── Loading state — mirrors the loaded layout so nothing jumps ────────────
  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <View style={[styles.skeletonWrap, { paddingTop: insets.top + Spacing['12'] }]}>
          <SkeletonBlock width={88} height={88} radius={44} />
          <SkeletonText width="50%" size="lg" style={{ marginTop: Spacing['4'] }} />
          <SkeletonText width="30%" size="sm" style={{ marginTop: Spacing['2'] }} />
          <SkeletonBlock width="100%" height={64} radius={BorderRadius.lg} style={{ marginTop: Spacing['6'] }} />
        </View>
      </View>
    );
  }

  // ── Not found state ───────────────────────────────────────────────────────
  if (!profile) {
    return (
      <View style={[styles.rootCentered, { backgroundColor: colors.background.primary }]}>
        <EmptyState
          icon={UserCircle}
          title="This profile isn't available"
          description="The account may have been removed or the link is out of date."
          actionLabel="Go back"
          onAction={() => router.back()}
          actionHaptic="light"
        />
      </View>
    );
  }

  // ── Full profile ──────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
      {/* Back button row — outside ScrollView so it stays fixed */}
      <View style={[styles.backRow, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        {/* Right spacer for visual balance */}
        <View style={styles.backSpacer} />
      </View>

      {/* Scrollable body */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Avatar + name block */}
        <View style={styles.avatarBlock}>
          <Avatar uri={profile.avatarUrl} name={profile.fullName} size="xl" />

          <Text
            style={[
              styles.displayName,
              { color: colors.text.primary },
            ]}
          >
            {profile.fullName}
          </Text>

          <Text style={{ color: colors.text.tertiary, fontSize: FontSize.sm }}>
            @{profile.username}
          </Text>

          {!!profile.bio && (
            <Text
              style={[styles.bio, { color: colors.text.secondary }]}
              numberOfLines={3}
            >
              {profile.bio}
            </Text>
          )}

          {!!profile.location && (
            <View style={[styles.locationRow, { marginTop: Spacing['1'] }]}>
              <MapPin size={12} color={colors.text.tertiary} weight="bold" />
              <Text style={{ color: colors.text.tertiary, fontSize: FontSize.xs }}>
                {profile.location}
              </Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text.primary }]}>
              {profile.tripsCount}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: FontSize.xs }}>
              Trips
            </Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: colors.background.cardBorder }]} />

          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text.primary }]}>
              {profile.followersCount}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: FontSize.xs }}>
              Followers
            </Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: colors.background.cardBorder }]} />

          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text.primary }]}>
              {profile.followingCount}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: FontSize.xs }}>
              Following
            </Text>
          </View>
        </View>

        {/* Follow / Edit / Wallet buttons */}
        <View style={styles.actionRow}>
          {isOwnProfile ? (
            <View
              style={{
                flexDirection: 'row',
                gap: Spacing['3'],
                justifyContent: 'center',
              }}
            >
              <Button
                label="Edit profile"
                variant="secondary"
                size="md"
                onPress={handleEditProfileOpen}
              />
              <Button
                label="Wallet"
                variant="secondary"
                size="md"
                icon={Bag}
                onPress={handleWalletPress}
              />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: Spacing['3'], justifyContent: 'center' }}>
              {isFollowing ? (
                <Button label="Following" variant="secondary" size="md" onPress={handleUnfollow} />
              ) : (
                <Button label="Follow" variant="primary" size="md" onPress={handleFollow} />
              )}
              {isFriend && (
                <Button label="Message" variant="secondary" size="md" icon={ChatCircleDots} onPress={handleMessage} />
              )}
            </View>
          )}
        </View>

        {/* Profile tab switcher */}
        <View style={styles.tabRow}>
          {PROFILE_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => handleTabPress(tab)}
              style={[
                styles.tabPill,
                {
                  backgroundColor:
                    activeProfileTab === tab
                      ? colors.brand.purple + '33'
                      : colors.background.card,
                  borderColor:
                    activeProfileTab === tab
                      ? colors.brand.purple
                      : colors.background.cardBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabPillText,
                  {
                    color:
                      activeProfileTab === tab
                        ? colors.brand.purple
                        : colors.text.tertiary,
                  },
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        {activeProfileTab === 'Posts' && <PostsGrid uid={uid ?? ''} />}
        {activeProfileTab === 'Trips' && (
          <TripsGrid trips={publicTrips} onTripPress={handleTripPress} authorProfiles={authorProfiles} />
        )}
        {activeProfileTab === 'Saved' && <SavedGrid uid={uid ?? ''} />}
      </ScrollView>

      {/* Edit profile modal */}
      <EditProfileSheet visible={editVisible} onClose={handleEditProfileClose} />
    </View>
  );
}

// ── Static styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  rootCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['2'],
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backSpacer: {
    width: 60,
  },
  scrollContent: {
    paddingBottom: Spacing['10'],
    width: '100%',
  },
  avatarBlock: {
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    gap: Spacing['2'],
  },
  displayName: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
    marginTop: Spacing['2'],
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bio: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing['1'],
    paddingHorizontal: Spacing['4'],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing['6'],
    marginHorizontal: Spacing['6'],
    paddingVertical: Spacing['4'],
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing['1'],
  },
  statNumber: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  statDivider: {
    width: 1,
    height: 32,
  },
  actionRow: {
    alignItems: 'center',
    marginTop: Spacing['4'],
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing['2'],
    marginTop: Spacing['6'],
    marginBottom: Spacing['4'],
    paddingHorizontal: Spacing['6'],
  },
  tabPill: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
