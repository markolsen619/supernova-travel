/**
 * components/profile/SavedGrid.tsx
 *
 * Placeholder grid for saved trips (Phase 2 — saved trips querying not yet implemented).
 */

import React from 'react';
import { View, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { FontSize } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface SavedGridProps {
  uid: string;
}

export function SavedGrid({ uid: _uid }: SavedGridProps) {
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
        Saved trips coming soon
      </Text>
    </View>
  );
}
