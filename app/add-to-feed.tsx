import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, MapTrifold } from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
import { StarField } from '@/components/animations/StarField';
import { DarkColors } from '@/constants/colors';
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
  const insets = useSafeAreaInsets();

  const options: PostOption[] = [
    {
      Icon: Camera,
      iconColor: '#f472b6',
      title: 'Post a Photo',
      description: 'Share a travel moment with your followers',
      onPress: () => router.push('/post/create-photo'),
    },
    {
      Icon: MapTrifold,
      iconColor: '#60a5fa',
      title: 'Share a Trip',
      description: 'Feature one of your trips on the feed',
      onPress: () => router.push('/post/create-trip'),
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#020208', '#07031a'] as [string, string]}
        style={StyleSheet.absoluteFill}
      />
      <StarField starCount={80} />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add to Feed</Text>
        <Image
          source={require('@/assets/images/SupernovaStar.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.subtitle}>What would you like to share?</Text>

      <View style={styles.cardsWrapper}>
        <View style={styles.options}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.title}
              style={styles.optionCard}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); opt.onPress(); }}
              activeOpacity={0.75}
            >
              <View style={styles.optionRow}>
                <opt.Icon size={32} color={opt.iconColor} weight="duotone" />
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{opt.title}</Text>
                  <Text style={styles.optionDesc}>{opt.description}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020208',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['2'],
  },
  backBtn: {
    width: 44,
    height: 64,
    justifyContent: 'center',
  },
  backText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: '#a78bfa',
  },
  headerLogo: {
    width: 64,
    height: 64,
  },
  title: {
    flex: 1,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    color: DarkColors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: DarkColors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: Spacing['6'],
    marginBottom: Spacing['2'],
  },
  cardsWrapper: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['6'],
  },
  options: {
    gap: Spacing['3'],
  },
  optionCard: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    padding: Spacing['5'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['4'],
  },
  optionText: { flex: 1 },
  optionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.primary,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: FontSize.sm,
    color: DarkColors.text.secondary,
  },
});
