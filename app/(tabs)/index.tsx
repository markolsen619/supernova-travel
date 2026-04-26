import { View, Text, StyleSheet, Dimensions, FlatList, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const { height } = Dimensions.get('window');

// Placeholder feed item — replaced in Phase 2 with real PostCard + Firestore data
function FeedCard({ item }: { item: { id: string; destination: string; user: string } }) {
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['#1a0a3a', '#0a0a1a']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glow} />

      <View style={styles.cardContent}>
        <View style={styles.cardBottom}>
          <Text style={styles.destination}>✦ {item.destination}</Text>
          <Text style={styles.username}>@{item.user}</Text>
        </View>
      </View>
    </View>
  );
}

const PLACEHOLDER_DATA = [
  { id: '1', destination: 'Santorini, Greece', user: 'explorer_jane' },
  { id: '2', destination: 'Kyoto, Japan', user: 'wanderlust_dev' },
  { id: '3', destination: 'Patagonia, Argentina', user: 'mountain_mark' },
];

export default function FeedScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Tab toggle */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <Text style={styles.headerTitle}>For You</Text>
        <Text style={[styles.headerTitle, styles.headerInactive]}>Following</Text>
      </View>

      <FlatList
        data={PLACEHOLDER_DATA}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FeedCard item={item} />}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing['6'],
    paddingBottom: Spacing['3'],
  },
  headerTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: Colors.white,
  },
  headerInactive: {
    color: Colors.text.tertiary,
  },
  list: { flex: 1 },
  card: {
    width: '100%',
    height,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(120,80,255,0.12)',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing['6'],
    paddingBottom: 100,
  },
  cardBottom: { gap: Spacing['2'] },
  destination: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    color: Colors.white,
  },
  username: {
    fontSize: FontSize.base,
    color: Colors.text.secondary,
  },
});
