import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

export default function UserProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>User: {uid}</Text>
      <Text style={styles.sub}>Public profile — Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  sub: { fontSize: FontSize.sm, color: Colors.text.tertiary, marginTop: 8 },
});
