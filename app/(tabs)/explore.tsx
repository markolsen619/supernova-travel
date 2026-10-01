import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Bag, Compass, MapTrifold } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { columnWidth } from '@/utils/layout';
import { useExplore } from '@/hooks/useExplore';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useDestinations } from '@/hooks/useDestinations';
import { filterDestinations, REGION_CHIPS, VIBE_CHIPS, type RegionChip, type VibeChip } from '@/utils/destinations';
import { DestinationCard } from '@/components/explore/DestinationCard';
import { FilterChips } from '@/components/explore/FilterChips';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { TripGrid } from '@/components/explore/TripGrid';
import { SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { ScreenHeaderStar } from '@/components/ui/ScreenHeaderStar';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';

export default function ExploreScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, columns } = useLayout();
  // Must match DestinationCard and TripGrid, which size themselves the same way.
  const gridItemWidth = columnWidth(width, columns);

  const { trips, tripsLoading, suggestions, suggestionsLoading } = useExplore();

  const { destinations, isLoading: destinationsLoading } = useDestinations();
  const [region, setRegion] = useState<RegionChip>('all');
  const [vibe, setVibe] = useState<VibeChip>('all');
  const shown = useMemo(() => filterDestinations(destinations, region, vibe), [destinations, region, vibe]);

  // The grid springs in again whenever the filter changes.
  const gridAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    gridAnim.setValue(0);
    Animated.spring(gridAnim, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }).start();
  }, [region, vibe, gridAnim]);

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

  const handleDestinationPress = useCallback((slug: string) => {
    router.push(`/destination/${slug}`);
  }, [router]);

  const handleClearFilters = useCallback(() => {
    setRegion('all');
    setVibe('all');
  }, []);

  const handleCreateTrip = useCallback(() => {
    router.push('/trip/new');
  }, [router]);

  const handleWalletPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(wallet)');
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
          <View style={styles.headerTopRow}>
            <View style={styles.titleRow}>
              <ScreenHeaderStar />
              <Text style={[styles.title, { color: colors.text.primary }]}>
                Explore
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleWalletPress}
              style={styles.walletBtn}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Wallet"
            >
              <Bag size={22} color={colors.text.secondary} weight="regular" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            Where to next
          </Text>
        </View>

        {/* ── Destinations ──
            The editorial catalog, filtered by one region and one vibe. Hidden
            only if the catalog itself is empty (never seeded / offline), so
            the screen falls back to Latest trips alone. */}
        {(destinationsLoading || destinations.length > 0) && (
          <View style={styles.section}>
            <View style={styles.chipRows}>
              <FilterChips items={REGION_CHIPS} selected={region} onSelect={setRegion} label="Region" />
              <FilterChips items={VIBE_CHIPS} selected={vibe} onSelect={setVibe} label="Vibe" />
            </View>
            {destinationsLoading ? (
              <View style={styles.tripGridSkeleton}>
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonCard key={i} width={gridItemWidth} height={Math.round(gridItemWidth * 1.3)} radius={BorderRadius.xl} />
                ))}
              </View>
            ) : shown.length === 0 ? (
              <EmptyState
                icon={Compass}
                title="No destinations match yet"
                description="We're adding places every week. Try another region or vibe."
                actionLabel="Clear filters"
                onAction={handleClearFilters}
                actionHaptic="light"
              />
            ) : (
              <Animated.View
                style={[
                  styles.destinationGrid,
                  { opacity: gridAnim, transform: [{ translateY: gridAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
                ]}
              >
                {shown.map((d) => (
                  <DestinationCard key={d.slug} destination={d} onPress={handleDestinationPress} />
                ))}
              </Animated.View>
            )}
            {shown.some((d) => d.coverImageUrl) && (
              <Text style={[styles.attribution, { color: colors.text.tertiary }]}>
                Powered by Google
              </Text>
            )}
          </View>
        )}

        {/* ── Latest trips ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
            Latest trips
          </Text>

          {tripsLoading ? (
            <View style={styles.tripGridSkeleton}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} width={gridItemWidth} height={160} radius={BorderRadius.xl} />
              ))}
            </View>
          ) : trips.length === 0 ? (
            /* Lives here rather than as a ListEmptyComponent inside TripGrid:
               components/profile/TripsGrid wraps that same grid for
               app/user/[uid], where "Create a trip" would be the wrong
               invitation on someone else's profile. */
            <EmptyState
              icon={MapTrifold}
              title="Be the first to share a trip"
              description="Set a trip to public and it shows up here for other travelers to discover."
              actionLabel="Create a trip"
              onAction={handleCreateTrip}
              actionHaptic="light"
            />
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
            <Text style={[styles.sectionTitle, styles.sectionTitleInset, { color: colors.text.secondary }]}>
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
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['1'],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  subtitle: {
    fontSize: FontSize.sm,
  },
  walletBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  chipRows: {
    gap: Spacing['2'],
    marginBottom: Spacing['4'],
  },
  destinationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing['6'],
    gap: Spacing['3'],
  },
  attribution: {
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['2'],
  },
  peopleSection: {
    paddingHorizontal: Spacing['6'],
    // Left-aligned with the headings, but stops before a follow row stretches
    // across an iPad. No iPhone reaches it.
    maxWidth: 640,
  },
  // The section already insets its content; without this the title was
  // indented twice as far as every other section title.
  sectionTitleInset: {
    paddingHorizontal: 0,
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
