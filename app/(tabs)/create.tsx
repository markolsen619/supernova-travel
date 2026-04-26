import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { useAuthStore } from '@/stores/useAuthStore';

interface CreateOption {
  icon: string;
  title: string;
  description: string;
  tier?: 'pro';
  onPress: () => void;
}

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { tier } = useAuthStore();

  const options: CreateOption[] = [
    {
      icon: '🗺️',
      title: 'Manual Trip',
      description: 'Build your own itinerary day by day',
      onPress: () => router.push('/trip/new'),
    },
    {
      icon: '✨',
      title: 'AI Generate Trip',
      description: tier === 'free' ? '1 free trip per week with Gemini AI' : 'Unlimited AI trips with Gemini AI',
      tier: tier === 'free' ? undefined : 'pro',
      onPress: () => router.push('/trip/ai-generate'),
    },
    {
      icon: '📸',
      title: 'Post a Photo',
      description: 'Share a travel moment with your followers',
      onPress: () => {},
    },
    {
      icon: '🎬',
      title: 'Post a Clip',
      description: tier === 'free' ? 'Up to 15 seconds' : 'Up to 30 seconds',
      onPress: () => {},
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a0a1a', '#1a0a3a']} style={StyleSheet.absoluteFill} />
      <View style={styles.glow} />

      <Text style={styles.title}>Create</Text>
      <Text style={styles.subtitle}>What will you share today?</Text>

      <View style={styles.options}>
        {options.map((opt) => (
          <TouchableOpacity key={opt.title} style={styles.optionCard} onPress={opt.onPress} activeOpacity={0.8}>
            <LinearGradient colors={Colors.gradient.card} style={StyleSheet.absoluteFill} />
            <View style={styles.optionCardBorder} />
            <View style={styles.optionRow}>
              <Text style={styles.optionIcon}>{opt.icon}</Text>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{opt.title}</Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  glow: { position: 'absolute', top: 0, right: -50, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(120,80,255,0.15)' },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.black, color: Colors.white, paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'] },
  subtitle: { fontSize: FontSize.sm, color: Colors.text.secondary, paddingHorizontal: Spacing['6'], marginBottom: Spacing['6'] },
  options: { paddingHorizontal: Spacing['6'], gap: Spacing['3'] },
  optionCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', padding: Spacing['5'], borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)' },
  optionCardBorder: { position: 'absolute', inset: 0, borderRadius: BorderRadius.xl },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['4'] },
  optionIcon: { fontSize: 32 },
  optionText: { flex: 1 },
  optionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.white, marginBottom: 2 },
  optionDesc: { fontSize: FontSize.sm, color: Colors.text.secondary },
});
