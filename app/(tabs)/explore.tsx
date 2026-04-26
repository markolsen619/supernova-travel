import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const DESTINATIONS = [
  { id: '1', name: 'Santorini', country: 'Greece', emoji: '🇬🇷' },
  { id: '2', name: 'Kyoto', country: 'Japan', emoji: '🇯🇵' },
  { id: '3', name: 'Patagonia', country: 'Argentina', emoji: '🇦🇷' },
  { id: '4', name: 'Bali', country: 'Indonesia', emoji: '🇮🇩' },
  { id: '5', name: 'Amalfi Coast', country: 'Italy', emoji: '🇮🇹' },
  { id: '6', name: 'Maldives', country: 'Maldives', emoji: '🇲🇻' },
];

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a0a1a', '#0d0d1f']} style={StyleSheet.absoluteFill} />

      <Text style={styles.title}>Explore</Text>
      <Text style={styles.subtitle}>Discover your next destination</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Trending Destinations</Text>
        <View style={styles.grid}>
          {DESTINATIONS.map((dest) => (
            <View key={dest.id} style={styles.destCard}>
              <LinearGradient colors={Colors.gradient.card} style={StyleSheet.absoluteFill} />
              <View style={styles.destCardBorder} />
              <Text style={styles.destEmoji}>{dest.emoji}</Text>
              <Text style={styles.destName}>{dest.name}</Text>
              <Text style={styles.destCountry}>{dest.country}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.black, color: Colors.white, paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'] },
  subtitle: { fontSize: FontSize.sm, color: Colors.text.secondary, paddingHorizontal: Spacing['6'], marginBottom: Spacing['4'] },
  scroll: { paddingHorizontal: Spacing['6'], paddingBottom: 100 },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, color: Colors.text.secondary, marginBottom: Spacing['4'], letterSpacing: 1, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['3'] },
  destCard: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  destCardBorder: { position: 'absolute', inset: 0, borderRadius: BorderRadius.xl },
  destEmoji: { fontSize: 36, marginBottom: Spacing['2'] },
  destName: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.white },
  destCountry: { fontSize: FontSize.xs, color: Colors.text.tertiary },
});
