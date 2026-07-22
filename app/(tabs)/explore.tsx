import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useExplore } from '@/hooks/useExplore';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { TrendingCard } from '@/components/explore/TrendingCard';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { TripGrid } from '@/components/explore/TripGrid';
import { SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { ScreenHeaderStar } from '@/components/ui/ScreenHeaderStar';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { Trip } from '@/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TRENDING_CARD_WIDTH = (SCREEN_WIDTH - Spacing['6'] * 2 - Spacing['3']) / 2;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - Spacing['6'] * 2 - Spacing['3']) / 2;

interface TrendingDestination {
  name: string;
  country: string;
  photoUrl: string | null;
  tripCount: number;
}

// Each destination's photo is HARVESTED from a constituent trip's persisted
// coverImageUrl (resolved once, ever, by the trip-cover machinery in
// app/trip/[id].tsx and written to the shared trip doc). Deriving trending
// therefore never fetches: zero Places API calls per Explore open, per user,
// per refresh. Do not add a photo-resolution step here.
function deriveTrending(trips: Trip[]): TrendingDestination[] {
  const counts = new Map<
    string,
    { count: number; countryCode: string | null; photoUrl: string | null }
  >();

  for (const trip of trips) {
    const key = trip.destination.name;
    if (!key) continue;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.photoUrl && trip.coverImageUrl) {
        existing.photoUrl = trip.coverImageUrl;
      }
    } else {
      counts.set(key, {
        count: 1,
        countryCode: trip.destination.countryCode,
        photoUrl: trip.coverImageUrl || null,
      });
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, { count, countryCode, photoUrl }]) => ({
      name,
      country: countryCode ?? '',
      photoUrl,
      tripCount: count,
    }));
}

export default function ExploreScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { trips, tripsLoading, suggestions, suggestionsLoading } = useExplore();

  const trending = useMemo(() => deriveTrending(trips), [trips]);

  // Destination-level photo fallback for coverless trip cards: placeId → a
  // sibling trip's persisted coverImageUrl. Built entirely from trips already
  // in memory — zero Places calls, zero extra reads.
  const destinationPhotos = useMemo(() => {
    const map = new Map<string, string>();
    for (const trip of trips) {
      const placeId = trip.destination.placeId;
      if (placeId && trip.coverImageUrl && !map.has(placeId)) {
        map.set(placeId, trip.coverImageUrl);
      }
    }
    return map;
  }, [trips]);

  const { data: authorProfiles = {} } = useAuthorProfiles(trips.map((t) => t.authorUid));

  const latestTripsShowGooglePhotos = useMemo(
    () =>
      trips.some(
        (t) =>
          t.coverImageUrl ||
          (t.destination.placeId && destinationPhotos.has(t.destination.placeId)),
      ),
    [trips, destinationPhotos],
  );

  const handleTripPress = useCallback((tripId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${tripId}`);
  }, [router]);

  const handleTrendingPress = useCallback((name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/search', params: { q: name } });
  }, [router]);

  return (
    <ScreenEntrance>
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
          <View style={styles.titleRow}>
            <ScreenHeaderStar />
            <Text style={[styles.title, { color: colors.text.primary }]}>
              Explore
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            Discover your next destination
          </Text>
        </View>

        {/* ── Trending Destinations ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
            Trending destinations
          </Text>

          {tripsLoading ? (
            <View style={styles.trendingScroll}>
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} width={TRENDING_CARD_WIDTH} height={TRENDING_CARD_WIDTH} radius={BorderRadius.xl} />
              ))}
            </View>
          ) : trending.length > 0 ? (
            <>
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
                    photoUrl={dest.photoUrl}
                    tripCount={dest.tripCount}
                    onPress={() => handleTrendingPress(dest.name)}
                  />
                ))}
              </ScrollView>
              {trending.some((d) => d.photoUrl) && (
                <Text style={[styles.attribution, { color: colors.text.tertiary }]}>
                  Powered by Google
                </Text>
              )}
            </>
          ) : null}
        </View>

        {/* ── Latest Trips ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
            Latest Trips
          </Text>

          {tripsLoading ? (
            <View style={styles.tripGridSkeleton}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} width={GRID_ITEM_WIDTH} height={160} radius={BorderRadius.xl} />
              ))}
            </View>
          ) : (
            <>
              <TripGrid
                trips={trips}
                onTripPress={handleTripPress}
                destinationPhotos={destinationPhotos}
                authorProfiles={authorProfiles}
              />
              {latestTripsShowGooglePhotos && (
                <Text style={[styles.attribution, { color: colors.text.tertiary }]}>
                  Powered by Google
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── People to Follow ── */}
        {(suggestionsLoading || suggestions.length > 0) && (
          <View style={[styles.section, styles.peopleSection]}>
            <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
              People to follow
            </Text>

            {suggestionsLoading ? (
              <View style={{ gap: Spacing['4'] }}>
                {[0, 1, 2].map((i) => (
                  <SkeletonListRow key={i} />
                ))}
              </View>
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
    </ScreenEntrance>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['1'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
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
  attribution: {
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['2'],
  },
  peopleSection: {
    paddingHorizontal: Spacing['6'],
  },
  tripGridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing['6'],
    gap: Spacing['3'],
  },
  bottomPad: {
    height: 100,
  },
});
