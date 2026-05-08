import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarPlus, Sparkles, Camera, VideoCamera } from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { useAuthStore } from '@/stores/useAuthStore';

interface CreateOption {
  Icon: PhosphorIcon;
  iconColor: string;
  title: string;
  description: string;
  tier?: 'pro';
  onPress: () => void;
}

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { tier } = useAuthStore();

  const options: CreateOption[] = [
    {
      Icon: CalendarPlus,
      iconColor: '#60a5fa',
      title: 'Manual Trip',
      description: 'Build your own itinerary day by day',
      onPress: () => router.push('/trip/new'),
    },
    {
      Icon: Sparkles,
      iconColor: '#a78bfa',
      title: 'AI Generate Trip',
      description: tier === 'free' ? '1 free trip per week with Gemini AI' : 'Unlimited AI trips with Gemini AI',
      tier: tier === 'free' ? undefined : 'pro',
      onPress: () => router.push('/trip/ai-generate'),
    },
    {
      Icon: Camera,
      iconColor: '#f472b6',
      title: 'Post a Photo',
      description: 'Share a travel moment with your followers',
      onPress: () => {},
    },
    {
      Icon: VideoCamera,
      iconColor: '#34d399',
      title: 'Post a Clip',
      description: tier === 'free' ? 'Up to 15 seconds' : 'Up to 30 seconds',
      onPress: () => {},
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
      <LinearGradient colors={colors.gradient.dark} style={StyleSheet.absoluteFill} />
      <View style={styles.glow} />

      <Text style={[styles.title, { color: colors.text.primary }]}>Create</Text>
      <Text style={[styles.subtitle, { color: colors.text.secondary }]}>What will you share today?</Text>

      <View style={styles.options}>
        {options.map((opt) => (
          <TouchableOpacity key={opt.title} style={[styles.optionCard, { borderColor: colors.background.cardBorder }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); opt.onPress(); }} activeOpacity={0.8}>
            <LinearGradient colors={colors.gradient.card} style={StyleSheet.absoluteFill} />
            <View style={styles.optionCardBorder} />
            <View style={styles.optionRow}>
              <opt.Icon size={32} color={opt.iconColor} weight="duotone" />
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.text.primary }]}>{opt.title}</Text>
                <Text style={[styles.optionDesc, { color: colors.text.secondary }]}>{opt.description}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glow: { position: 'absolute', top: 0, right: -50, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(120,80,255,0.15)' },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.black, paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'] },
  subtitle: { fontSize: FontSize.sm, paddingHorizontal: Spacing['6'], marginBottom: Spacing['6'] },
  options: { paddingHorizontal: Spacing['6'], gap: Spacing['3'] },
  optionCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', padding: Spacing['5'], borderWidth: 1 },
  optionCardBorder: { position: 'absolute', inset: 0, borderRadius: BorderRadius.xl },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['4'] },
  optionText: { flex: 1 },
  optionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: 2 },
  optionDesc: { fontSize: FontSize.sm },
});
