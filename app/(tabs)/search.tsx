import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type Tab = 'Places' | 'Trips' | 'Users' | 'Tags';
const TABS: Tab[] = ['Places', 'Trips', 'Users', 'Tags'];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Places');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a0a1a', '#0d0d1f']} style={StyleSheet.absoluteFill} />

      <Text style={styles.title}>Search</Text>

      {/* Search input */}
      <View style={styles.inputWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Places, trips, people, #tags..."
          placeholderTextColor={Colors.text.tertiary}
          autoCorrect={false}
        />
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🌍</Text>
        <Text style={styles.emptyText}>Search for destinations, trips, and more</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.black, color: Colors.white, paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'], marginBottom: Spacing['4'] },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing['6'],
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['4'],
    marginBottom: Spacing['4'],
  },
  searchIcon: { fontSize: 16, marginRight: Spacing['2'] },
  input: { flex: 1, color: Colors.white, fontSize: FontSize.base, paddingVertical: Spacing['3'] },
  tabs: { paddingHorizontal: Spacing['6'], gap: Spacing['2'], marginBottom: Spacing['4'] },
  tab: { paddingHorizontal: Spacing['4'], paddingVertical: Spacing['2'], borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tabActive: { backgroundColor: 'rgba(167,139,250,0.2)', borderColor: Colors.brand.purple },
  tabText: { fontSize: FontSize.sm, color: Colors.text.tertiary, fontWeight: FontWeight.medium },
  tabTextActive: { color: Colors.brand.purple },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing['3'] },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: FontSize.base, color: Colors.text.tertiary, textAlign: 'center', paddingHorizontal: Spacing['8'] },
});
