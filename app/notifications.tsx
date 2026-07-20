import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ArrowLeft, Compass } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { EmptyState } from '@/components/ui/EmptyState';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Activity</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.empty}>
        <EmptyState
          icon={Bell}
          title="Your activity lives here"
          description="Likes, comments, and messages from other travelers will appear here."
          actionLabel="Find travelers to follow"
          actionIcon={Compass}
          onAction={() => router.navigate('/(tabs)/explore')}
          actionHaptic="light"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['8'],
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semiBold,
  },
  emptyBody: {
    fontSize: FontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
});
