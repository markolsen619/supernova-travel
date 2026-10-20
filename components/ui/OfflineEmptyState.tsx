import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WifiSlash } from 'phosphor-react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';

/**
 * Shown where nothing was saved for offline use (feed, explore, notifications, other profiles): a whole
 * screen on the page background, so a screen can return it on its own (offline spec §3).
 */
export function OfflineEmptyState({ title, description }: { title: string; description: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
      <EmptyState icon={WifiSlash} title={title} description={description} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
});
