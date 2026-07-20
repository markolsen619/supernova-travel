import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X, Camera, MapTrifold } from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
import { useTheme } from '@/hooks/useTheme';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface PostOption {
  Icon: PhosphorIcon;
  iconColor: string;
  title: string;
  description: string;
  onPress: () => void;
}

export default function AddToFeedScreen() {
  const { colors } = useTheme();

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const options: PostOption[] = [
    {
      Icon: Camera,
      iconColor: colors.brand.pink,
      title: 'Post a photo',
      description: 'Share a travel moment with your followers',
      onPress: () => router.push('/post/create-photo'),
    },
    {
      Icon: MapTrifold,
      iconColor: colors.brand.blue,
      title: 'Share a trip',
      description: 'Feature one of your trips on the feed',
      onPress: () => router.push('/post/create-trip'),
    },
  ];

  return (
    <ScreenEntrance>
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <View style={styles.topBarSide}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close"
          >
            <X size={20} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>SHARE</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>Add to feed</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          What would you like to share?
        </Text>
      </View>

      <View style={styles.options}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.title}
            style={[
              styles.optionCard,
              { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); opt.onPress(); }}
            activeOpacity={0.75}
            accessibilityLabel={opt.title}
          >
            <View style={[styles.optionIconBubble, { backgroundColor: `${opt.iconColor}1A` }]}>
              <opt.Icon size={26} color={opt.iconColor} weight="duotone" />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>{opt.title}</Text>
              <Text style={[styles.optionDesc, { color: colors.text.secondary }]}>{opt.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['4'],
  },
  topBarSide: {
    width: 44,
    alignItems: 'flex-end',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['5'],
    gap: Spacing['1'],
  },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  subtitle: {
    fontSize: FontSize.base,
    marginTop: Spacing['1'],
  },
  options: {
    paddingHorizontal: Spacing['6'],
    gap: Spacing['3'],
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['4'],
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing['5'],
  },
  optionIconBubble: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: FontSize.sm,
  },
});
