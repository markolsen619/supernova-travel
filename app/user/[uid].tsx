/**
 * app/user/[uid].tsx
 *
 * Full-screen public profile for any user.
 * Navigated to via router.push('/user/<uid>') — not part of the tab bar.
 */

import React, { useCallback } from 'react';
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
import { TripGrid } from '@/components/explore/TripGrid';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function UserProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { profile, isLoading, isFollowing, isOwnProfile } = usePublicProfile(uid ?? null);
  const { follow, unfollow } = useFollow(uid ?? '');
  const { data: trips = [] } = useTripList(uid ?? null);

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

  const handleTripPress = useCallback(
    (id: string) => {
      router.push(`/trip/${id}`);
    },
    [],
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <LinearGradient
          colors={colors.gradient.dark}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator color={colors.brand.purple} size="large" />
      </View>
    );
  }

  // ── Not found state ───────────────────────────────────────────────────────
  if (!profile) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <LinearGradient
          colors={colors.gradient.dark}
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
        colors={colors.gradient.dark}
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

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text.primary }]}>
              {profile.followersCount}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: FontSize.xs }}>
              Followers
            </Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text.primary }]}>
              {profile.followingCount}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: FontSize.xs }}>
              Following
            </Text>
          </View>
        </View>

        {/* Follow / Edit button */}
        <View style={styles.actionRow}>
          {isOwnProfile ? (
            <Button
              label="Edit Profile"
              variant="secondary"
              size="md"
              onPress={() => router.push('/settings')}
            />
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

        {/* Trips section */}
        <View style={styles.tripsSection}>
          <Text style={[styles.sectionHeader, { color: colors.text.primary }]}>
            Trips
          </Text>
          <TripGrid trips={publicTrips} onTripPress={handleTripPress} />
        </View>
      </ScrollView>
    </View>
  );
}

// ── Static styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  actionRow: {
    alignItems: 'center',
    marginTop: Spacing['4'],
  },
  tripsSection: {
    marginTop: Spacing['6'],
    paddingHorizontal: Spacing['6'],
  },
  sectionHeader: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing['3'],
  },
});
