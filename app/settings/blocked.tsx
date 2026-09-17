import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretLeft, Prohibit } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useModerationStore } from '@/stores/useModerationStore';
import { useContentActions } from '@/components/moderation/useContentActions';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

/**
 * Everyone the user has blocked, with a way back. Blocking is reachable from
 * any post, comment, message, trip, or profile; this is the one place to
 * review it all.
 */
export default function BlockedAccountsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const blockedUids = useModerationStore((s) => s.blockedUids);
  const { data: profiles = {} } = useAuthorProfiles(blockedUids);
  const { unblock } = useContentActions();

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const renderItem = useCallback(
    ({ item: uid }: { item: string }) => {
      const name = profiles[uid]?.name ?? 'Traveler';
      return (
        <View style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}>
          <Avatar uri={profiles[uid]?.avatarUrl ?? null} name={name} size="sm" />
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
            {name}
          </Text>
          <Button
            label="Unblock"
            variant="secondary"
            size="sm"
            haptic="none"
            onPress={() => unblock(uid, name)}
          />
        </View>
      );
    },
    [profiles, colors, unblock],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Back">
          <CaretLeft size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Blocked accounts</Text>
        <View style={styles.backButton} />
      </View>

      {blockedUids.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon={Prohibit}
            title="You haven't blocked anyone"
            description="Block someone from their profile, or from any post, comment, or message of theirs. They'll be listed here if you change your mind."
            actionLabel="Back to privacy"
            onAction={handleBack}
            actionHaptic="none"
          />
        </View>
      ) : (
        <FlashList
          data={blockedUids}
          keyExtractor={(uid) => uid}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: Spacing['5'], paddingBottom: insets.bottom + Spacing['8'] }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['4'],
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing['5'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
});
