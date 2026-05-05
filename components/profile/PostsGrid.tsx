/**
 * components/profile/PostsGrid.tsx
 *
 * Placeholder grid for user posts (Phase 2 — feed querying not yet implemented).
 */

import React from 'react';
import { View, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { FontSize } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface PostsGridProps {
  uid: string;
}

export function PostsGrid({ uid: _uid }: PostsGridProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        padding: Spacing['6'],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.text.tertiary, fontSize: FontSize.sm }}>
        Posts coming soon
      </Text>
    </View>
  );
}
