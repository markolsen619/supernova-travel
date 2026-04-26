import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Trip: {id}</Text>
      <Text style={styles.sub}>Full trip detail — Phase 3</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  sub: { fontSize: FontSize.sm, color: Colors.text.tertiary, marginTop: 8 },
});
