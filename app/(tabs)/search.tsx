import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useSearch } from '@/hooks/useSearch';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { UserResult } from '@/components/search/UserResult';
import { TripResult } from '@/components/search/TripResult';
import { PlaceResult } from '@/components/search/PlaceResult';

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'Places' | 'Users' | 'Trips';
const TABS: Tab[] = ['Places', 'Users', 'Trips'];

interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

// ── Places fetch ──────────────────────────────────────────────────────────────

async function fetchPlaces(input: string): Promise<PlaceSuggestion[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '',
    },
    body: JSON.stringify({ input, languageCode: 'en' }),
  });

  if (!res.ok) throw new Error(`Places API error: ${res.status}`);

  const json = await res.json();
  const suggestions: PlaceSuggestion[] = (json.suggestions ?? []).map(
    (s: {
      placePrediction: {
        placeId: string;
        structuredFormat: {
          mainText: { text: string };
          secondaryText: { text: string };
        };
      };
    }) => ({
      placeId: s.placePrediction.placeId,
      mainText: s.placePrediction.structuredFormat.mainText.text,
      secondaryText: s.placePrediction.structuredFormat.secondaryText?.text ?? '',
    })
  );

  return suggestions;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Places');

  // Places state
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState(false);

  // useSearch is called unconditionally (rules of hooks)
  const { users, trips, isSearching } = useSearch(query);

  // Places debounce + fetch
  useEffect(() => {
    if (activeTab !== 'Places') return;
    if (query.trim().length < 2) {
      setPlaces([]);
      setPlacesError(false);
      return;
    }

    setPlacesLoading(true);
    setPlacesError(false);

    const timer = setTimeout(async () => {
      try {
        const results = await fetchPlaces(query.trim());
        setPlaces(results);
      } catch {
        setPlacesError(true);
        setPlaces([]);
      } finally {
        setPlacesLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      setPlacesLoading(false);
    };
  }, [query, activeTab]);

  const handlePlacePress = useCallback((placeId: string, mainText: string) => {
    // Navigate or handle place selection — log for now
    console.log('Place selected:', placeId, mainText);
  }, []);

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderEmptyState(message: string) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>🌍</Text>
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
    if (!query.trim()) {
      return renderEmptyState('Search for places, people, and trips');
    }
    if (query.trim().length < 2) {
      return renderEmptyState('Keep typing…');
    }
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (users.length === 0) {
      return renderEmptyState(`No results for "${query}"`);
    }
    return (
      <>
        {users.map((u) => (
          <UserResult
            key={u.uid}
            user={u}
            onPress={() => router.push(`/user/${u.uid}`)}
          />
        ))}
      </>
    );
  }

  function renderTrips() {
    if (!query.trim()) {
      return renderEmptyState('Search for places, people, and trips');
    }
    if (query.trim().length < 2) {
      return renderEmptyState('Keep typing…');
    }
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (trips.length === 0) {
      return renderEmptyState(`No results for "${query}"`);
    }
    return (
      <>
        {trips.map((t) => (
          <TripResult
            key={t.id}
            trip={t}
            onPress={() => router.push(`/trip/${t.id}`)}
          />
        ))}
      </>
    );
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
      <LinearGradient
        colors={colors.gradient.dark}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <Text style={[styles.title, { color: colors.text.primary }]}>Search</Text>

      {/* Search input */}
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: colors.background.card,
            borderColor: colors.background.cardBorder,
          },
        ]}
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.input, { color: colors.text.primary }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Places, trips, people…"
          placeholderTextColor={colors.text.tertiary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tab,
              {
                backgroundColor:
                  activeTab === tab
                    ? 'rgba(167,139,250,0.2)'
                    : colors.background.card,
                borderColor:
                  activeTab === tab
                    ? colors.brand.purple
                    : colors.background.cardBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === tab
                      ? colors.brand.purple
                      : colors.text.tertiary,
                },
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results */}
      <ScrollView
        style={styles.results}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'Places' && renderPlaces()}
        {activeTab === 'Users' && renderUsers()}
        {activeTab === 'Trips' && renderTrips()}

        {/* Bottom breathing room */}
        <View style={{ height: Spacing['10'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    marginBottom: Spacing['4'],
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
  searchIcon: {
    fontSize: 16,
    marginRight: Spacing['2'],
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
  results: {
    flex: 1,
  },
  centered: {
    paddingTop: Spacing['10'],
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing['16'],
    gap: Spacing['3'],
    paddingHorizontal: Spacing['8'],
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: FontSize.base,
    textAlign: 'center',
  },
});
