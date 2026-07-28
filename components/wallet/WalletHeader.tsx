import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

interface WalletHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: { icon: PhosphorIcon; onPress: () => void; label: string };
}

// The back/star/title/[action] header every wallet screen used to hand-roll
// identically (see the pre-redesign wallet list/detail screens) — one
// shared component instead of an 8th, 9th, 10th copy.
export function WalletHeader({ title, onBack, rightAction }: WalletHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const RightIcon = rightAction?.icon;

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder },
      ]}
    >
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Back">
        <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
      </TouchableOpacity>

      <View style={styles.titleGroup}>
        <StarMark size={18} />
        <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
      </View>

      {rightAction && RightIcon ? (
        <TouchableOpacity
          onPress={rightAction.onPress}
          style={styles.rightButton}
          accessibilityLabel={rightAction.label}
        >
          <RightIcon size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
      ) : (
        <View style={styles.rightButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  rightButton: { width: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold },
});
