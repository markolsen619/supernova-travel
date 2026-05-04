import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { Avatar } from '@/components/ui/Avatar';
import { UserProfile } from '@/types';

interface UserResultProps {
  user: UserProfile;
  onPress: () => void;
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M followers`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K followers`;
  return `${count} followers`;
}

export function UserResult({ user, onPress }: UserResultProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}
    >
      <Avatar size="sm" uri={user.avatarUrl} name={user.displayName} />

      <View style={styles.center}>
        <Text
          style={[styles.displayName, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {user.displayName}
        </Text>
        <Text
          style={[styles.username, { color: colors.text.tertiary }]}
          numberOfLines={1}
        >
          @{user.username}
        </Text>
      </View>

      <Text style={[styles.followers, { color: colors.text.secondary }]}>
        {formatFollowers(user.followersCount)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing['3'],
  },
  center: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  username: {
    fontSize: FontSize.sm,
  },
  followers: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    flexShrink: 0,
  },
});
