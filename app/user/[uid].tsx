/**
 * app/user/[uid].tsx
 *
 * Full-screen public profile for any user.
 * Navigated to via router.push('/user/<uid>') — not part of the tab bar.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { useFollow } from '@/hooks/useFollow';
import { useTripList } from '@/hooks/useTripList';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
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

  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>('Trips');
  const [editVisible, setEditVisible] = useState(false);

  // Filter trips based on ownership — own profile sees all, others see public only
  const publicTrips = isOwnProfile
    ? trips
    : trips.filter((t) => t.visibility === 'public');

  const handleFollow = useCallback(() => {
    follow.mutate();
  }, [follow]);

  const handleUnfollow = useCallback(() => {
    unfollow.mutate();
  }, [unfollow]);

  const handleEditProfileOpen = useCallback(() => {
    setEditVisible(true);
  }, []);

  const handleEditProfileClose = useCallback(() => {
    setEditVisible(false);
  }, []);

  const handleWalletPress = useCallback(() => {
    router.push('/(wallet)/boarding-passes');
  }, []);

  const handleTripPress = useCallback(
    (id: string) => {
      router.push(`/trip/${id}`);
    },
    [],
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.rootCentered, { backgroundColor: colors.background.primary }]}>
        <LinearGradient
          colors={colors.gradient.dark as [string, string]}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator color={colors.brand.purple} size="large" />
      </View>
    );
  }

  // ── Not found state ───────────────────────────────────────────────────────
  if (!profile) {
    return (
      <View style={[styles.rootCentered, { backgroundColor: colors.background.primary }]}>
        <LinearGradient
          colors={colors.gradient.dark as [string, string]}
          style={StyleSheet.absoluteFill}
        />
        <Text style={{ color: colors.text.secondary, fontSize: FontSize.md }}>
          User not found.
        </Text>
      </View>
    );
  }

  // ── Full profile ──────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
      <LinearGradient
        colors={colors.gradient.dark as [string, string]}
        style={StyleSheet.absoluteFill}
      />

      {/* Back button row — outside ScrollView so it stays fixed */}
      <View style={[styles.backRow, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={{ color: colors.text.secondary, fontSize: FontSize.md }}>
            {'< Back'}
          </Text>
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
          <Avatar uri={profile.avatarUrl} name={profile.displayName} size="xl" />

          <Text
            style={[
              styles.displayName,
              { color: colors.text.primary },
            ]}
          >
            {profile.displayName}
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
            <Text
              style={{ color: colors.text.tertiary, fontSize: FontSize.xs, marginTop: Spacing['1'] }}
            >
              {'📍'} {profile.location}
            </Text>
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
                label="Edit Profile"
                variant="secondary"
                size="md"
                onPress={handleEditProfileOpen}
              />
              <Button
                label="🧳 Wallet"
                variant="secondary"
                size="md"
                onPress={handleWalletPress}
              />
            </View>
          ) : isFollowing ? (
            <Button
              label="Following"
              variant="secondary"
              size="md"
              onPress={handleUnfollow}
            />
          ) : (
            <Button
              label="Follow"
              variant="primary"
              size="md"
              onPress={handleFollow}
            />
          )}
        </View>

        {/* Profile tab switcher */}
        <View style={styles.tabRow}>
          {PROFILE_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveProfileTab(tab)}
              style={[
                styles.tabPill,
                {
                  backgroundColor:
                    activeProfileTab === tab
                      ? 'rgba(167,139,250,0.2)'
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
          <TripsGrid trips={publicTrips} onTripPress={handleTripPress} />
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
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['2'],
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
    fontWeight: FontWeight.bold,
    marginTop: Spacing['2'],
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
