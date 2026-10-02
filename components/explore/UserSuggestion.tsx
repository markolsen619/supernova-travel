import { useFollowRequest } from '@/hooks/useFollowRequests';
import { isPrivateAccount, followButtonState } from '@/utils/privacy';
import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFollow, useIsFollowing } from '@/hooks/useFollow';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { UserProfile } from '@/types';

interface UserSuggestionProps {
  user: UserProfile;
  onPress?: () => void;
}

export function UserSuggestion({ user, onPress }: UserSuggestionProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const currentUserUid = useAuthStore((s) => s.user?.uid);

  const { follow, unfollow } = useFollow(user.uid);
  const isFollowingQuery = useIsFollowing(user.uid);

  const isCurrentUser = currentUserUid === user.uid;
  const isFollowing = isFollowingQuery.data === true;
  const followLoading = follow.isPending || unfollow.isPending || isFollowingQuery.isLoading;
  // A private account is asked, not followed (utils/privacy).
  const { hasRequested, request, cancel } = useFollowRequest(user.uid, isPrivateAccount(user));
  const state = followButtonState({
    isSelf: isCurrentUser,
    isFollowing,
    hasRequested,
    targetPrivate: isPrivateAccount(user),
  });
  const label = { following: 'Following', requested: 'Requested', request: 'Request', follow: 'Follow', self: '' }[state];

  const handleRowPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.push(`/user/${user.uid}`);
    }
  }, [onPress, router, user.uid]);

  const handleFollowPress = () => {
    if (state === 'following') unfollow.mutate();
    else if (state === 'requested') cancel().catch(() => {});
    else if (state === 'request') request().catch(() => {});
    else follow.mutate();
  };

  return (
    <TouchableOpacity
      onPress={handleRowPress}
      activeOpacity={0.7}
      style={[styles.container, { borderBottomColor: colors.background.cardBorder }]}
      accessibilityLabel={`View ${user.fullName}'s profile`}
    >
      <Avatar uri={user.avatarUrl} name={user.fullName} size="md" />

      <View style={styles.info}>
        <Text
          style={[styles.displayName, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {user.fullName}
        </Text>
        <Text
          style={[styles.username, { color: colors.text.tertiary }]}
          numberOfLines={1}
        >
          @{user.username}
        </Text>
      </View>

      {!isCurrentUser && (
        <Button
          label={label}
          variant="secondary"
          size="sm"
          haptic="medium"
          onPress={handleFollowPress}
          loading={followLoading}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    gap: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    marginBottom: 2,
  },
  username: {
    fontSize: FontSize.sm,
  },
});
