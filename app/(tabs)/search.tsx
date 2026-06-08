import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useSearch } from '@/hooks/useSearch';
import { usePlaceAutocomplete } from '@/hooks/usePlaceAutocomplete';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { UserResult } from '@/components/search/UserResult';
import { TripResult } from '@/components/search/TripResult';
import { PlaceResult } from '@/components/search/PlaceResult';

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'Places' | 'Users' | 'Trips';
const TABS: Tab[] = ['Places', 'Users', 'Trips'];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Places');

  // Places — session tokens managed inside the hook
  const {
    query: placesQuery,
    setQuery: setPlacesQuery,
    suggestions: places,
    isLoading: placesLoading,
    error: placesError,
    selectPlace,
  } = usePlaceAutocomplete();

  // Mirror the shared search bar into both Algolia and Places hooks
  const { users, trips, isSearching } = useSearch(query);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setPlacesQuery(text);
    },
    [setPlacesQuery],
  );

  const handleTabPress = useCallback(
    (tab: Tab) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tab);
    },
    [],
  );

  const handlePlacePress = useCallback(
    async (placeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const selection = await selectPlace(placeId);
        // Navigate to AI generator with destination pre-filled
        router.push({
          pathname: '/trip/ai-generate',
          params: {
            destination: selection.name,
            countryCode: selection.countryCode ?? '',
            placeId: selection.placeId,
          },
        });
      } catch {
        // silently ignore — network error or quota exceeded
      }
    },
    [selectPlace],
  );

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderEmptyState(message: string) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{message}</Text>
      </View>
    );
  }

  function renderPlaces() {
    if (placesLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (placesError) {
      return renderEmptyState('Search failed. Please try again.');
    }
    if (!query.trim()) {
      return renderEmptyState('Search for places, people, and trips');
    }
    if (query.trim().length < 2) {
      return renderEmptyState('Keep typing…');
    }
    if (places.length === 0) {
      return renderEmptyState(`No results for "${query}"`);
    }
    return (
      <>
        {places.map((p) => (
          <PlaceResult
            key={p.placeId}
            placeId={p.placeId}
            mainText={p.mainText}
            secondaryText={p.secondaryText}
            onPress={handlePlacePress}
          />
        ))}
      </>
    );
  }

  function renderUsers() {
    if (!query.trim() || query.trim().length < 2) {
      return renderEmptyState(!query.trim() ? 'Search for places, people, and trips' : 'Keep typing…');
    }
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (users.length === 0) return renderEmptyState(`No results for "${query}"`);
    return (
      <>
        {users.map((u) => (
          <UserResult key={u.uid} user={u} onPress={() => router.push(`/user/${u.uid}`)} />
        ))}
      </>
    );
  }

  function renderTrips() {
    if (!query.trim() || query.trim().length < 2) {
      return renderEmptyState(!query.trim() ? 'Search for places, people, and trips' : 'Keep typing…');
    }
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (trips.length === 0) return renderEmptyState(`No results for "${query}"`);
    return (
      <>
        {trips.map((t) => (
          <TripResult key={t.id} trip={t} onPress={() => router.push(`/trip/${t.id}`)} />
        ))}
      </>
    );
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
      <LinearGradient colors={colors.gradient.dark} style={StyleSheet.absoluteFill} />

      <View style={styles.titleRow}>
        <Image
          source={require('@/assets/images/SupernovaStar.png')}
          style={styles.starIcon}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: colors.text.primary }]}>Search</Text>
      </View>

      <View
        style={[
          styles.inputWrap,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.text.primary }]}
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Places, trips, people…"
          placeholderTextColor={colors.text.tertiary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => handleTabPress(tab)}
            style={[
              styles.tab,
              {
                backgroundColor: activeTab === tab ? 'rgba(167,139,250,0.2)' : colors.background.card,
                borderColor: activeTab === tab ? colors.brand.purple : colors.background.cardBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.brand.purple : colors.text.tertiary },
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.results}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'Places' && renderPlaces()}
        {activeTab === 'Users' && renderUsers()}
        {activeTab === 'Trips' && renderTrips()}
        <View style={{ height: Spacing['10'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    marginBottom: Spacing['4'],
  },
  starIcon: { width: 28, height: 28 },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing['6'],
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['4'],
    marginBottom: Spacing['4'],
  },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    paddingVertical: Spacing['3'],
  },
  tabs: {
    paddingHorizontal: Spacing['6'],
    gap: Spacing['2'],
    marginBottom: Spacing['4'],
  },
  tab: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  results: { flex: 1 },
  centered: {
    paddingTop: Spacing['10'],
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing['16'],
    paddingHorizontal: Spacing['8'],
  },
  emptyText: {
    fontSize: FontSize.base,
    textAlign: 'center',
  },
});
