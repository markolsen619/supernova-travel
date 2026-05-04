import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useExplore } from '@/hooks/useExplore';
import { TrendingCard } from '@/components/explore/TrendingCard';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { TripGrid } from '@/components/explore/TripGrid';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Trip } from '@/types';

// Map ISO country codes to flag emojis.  Falls back to 🌍 for unknowns.
function countryCodeToEmoji(code: string | null): string {
  if (!code || code.length !== 2) return '🌍';
  const offset = 0x1f1e6 - 0x41;
  return (
    String.fromCodePoint(code.toUpperCase().charCodeAt(0) + offset) +
    String.fromCodePoint(code.toUpperCase().charCodeAt(1) + offset)
  );
}

interface TrendingDestination {
  name: string;
  country: string;
  emoji: string;
  tripCount: number;
}

function deriveTrending(trips: Trip[]): TrendingDestination[] {
  const counts = new Map<string, { count: number; countryCode: string | null }>();

  for (const trip of trips) {
    const key = trip.destination.name;
    if (!key) continue;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { count: 1, countryCode: trip.destination.countryCode });
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, { count, countryCode }]) => ({
      name,
      country: countryCode ?? '',
      emoji: countryCodeToEmoji(countryCode),
      tripCount: count,
    }));
}

export default function ExploreScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { trips, tripsLoading, suggestions, suggestionsLoading } = useExplore();

  const trending = useMemo(() => deriveTrending(trips), [trips]);

  const handleTripPress = (tripId: string) => {
    router.push(`/trip/${tripId}`);
  };

  const handleTrendingPress = (destinationName: string) => {
    router.push(`/search?q=${encodeURIComponent(destinationName)}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing['4'] },
        ]}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            Explore
          </Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            Discover your next destination
          </Text>
        </View>

        {/* ── Trending Destinations ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
            Trending Destinations
          </Text>

          {tripsLoading ? (
            <ActivityIndicator
              color={colors.brand.purple}
              style={styles.loader}
            />
          ) : trending.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingScroll}
            >
              {trending.map((dest) => (
                <TrendingCard
                  key={dest.name}
                  name={dest.name}
                  country={dest.country}
                  emoji={dest.emoji}
                  tripCount={dest.tripCount}
                  onPress={() => handleTrendingPress(dest.name)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* ── Latest Trips ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
            Latest Trips
          </Text>

          {tripsLoading ? (
            <ActivityIndicator
              color={colors.brand.purple}
              style={styles.loader}
            />
          ) : (
            <TripGrid trips={trips} onTripPress={handleTripPress} />
          )}
        </View>

        {/* ── People to Follow ── */}
        {(suggestionsLoading || suggestions.length > 0) && (
          <View style={[styles.section, styles.peopleSection]}>
            <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
              People to Follow
            </Text>

            {suggestionsLoading ? (
              <ActivityIndicator
                color={colors.brand.purple}
                style={styles.loader}
              />
            ) : (
              suggestions.map((user) => (
                <UserSuggestion key={user.uid} user={user} />
              ))
            )}
          </View>
        )}

        {/* Bottom spacing for tab bar */}
        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['6'],
  },
  header: {
    paddingHorizontal: Spacing['6'],
    marginBottom: Spacing['6'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
  },
  section: {
    marginBottom: Spacing['6'],
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing['3'],
    paddingHorizontal: Spacing['6'],
  },
  trendingScroll: {
    paddingHorizontal: Spacing['6'],
    gap: Spacing['3'],
    flexDirection: 'row',
  },
  peopleSection: {
    paddingHorizontal: Spacing['6'],
  },
  loader: {
    marginVertical: Spacing['6'],
  },
  bottomPad: {
    height: 100,
  },
});
