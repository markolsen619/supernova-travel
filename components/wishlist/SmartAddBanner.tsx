/**
 * The banner after a smart add (spec 2026-11-10 §2): what was added where, Change day and Undo. Springs in; the hook
 * hides it after 6 s.
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CheckCircle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Shadow, Spacing } from '@/constants/spacing';

export function SmartAddBanner({ text, onChangeDay, onUndo, onDismiss, bottom }: {
  text: string; onChangeDay: () => void; onUndo: () => void; onDismiss: () => void; bottom: number;
}) {
  const { colors } = useTheme();
  const change = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChangeDay(); }, [onChangeDay]);
  const undo = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUndo(); }, [onUndo]);
  return (
    <Animated.View entering={FadeInDown.springify().damping(11).stiffness(65)} exiting={FadeOutDown} style={[styles.wrap, { bottom }]}>
      <Pressable onPress={onDismiss} style={[styles.card, Shadow.md, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
        accessibilityRole="alert" accessibilityLabel={text}>
        <View style={styles.row}>
          <CheckCircle size={18} weight="duotone" color={colors.brand.purple} />
          <Text style={[styles.text, { color: colors.text.primary }]} numberOfLines={2}>{text}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={change} style={styles.action} accessibilityRole="button" accessibilityLabel="Change day">
            <Text style={[styles.actionText, { color: colors.text.secondary }]}>Change day</Text>
          </Pressable>
          <Pressable onPress={undo} style={styles.action} accessibilityRole="button" accessibilityLabel="Undo">
            <Text style={[styles.actionText, { color: colors.text.primary }]}>Undo</Text>
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing['4'], right: Spacing['4'] },
  card: { borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing['4'], paddingTop: Spacing['3'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  text: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing['4'] },
  action: { minHeight: 44, justifyContent: 'center' },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
