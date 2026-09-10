import React, { useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { twoColumnWidth } from '@/utils/layout';
import { TripCard } from '@/components/trip/TripCard';
import type { AuthorInfo } from '@/hooks/useAuthorProfiles';
import { Spacing } from '@/constants/spacing';
import { Trip } from '@/types';

const NUM_COLUMNS = 2;

interface TripGridProps {
  trips: Trip[];
  onTripPress: (tripId: string) => void;
  /**
   * placeId → destination photo URL, harvested by the caller from trips
   * already in memory. Display-only fallback for coverless trips — never a
   * resolution path.
   */
  destinationPhotos?: ReadonlyMap<string, string>;
  /** authorUid → {name, avatarUrl}, batch-fetched by the caller (these trips
   * span multiple authors) — see hooks/useAuthorProfiles. */
  authorProfiles?: Record<string, AuthorInfo>;
}

export function TripGrid({ trips, onTripPress, destinationPhotos, authorProfiles }: TripGridProps) {
  const { colors } = useTheme();
  const { width } = useLayout();
  const itemWidth = twoColumnWidth(width);

  const renderItem = useCallback(
    ({ item }: { item: Trip }) => (
      <View style={styles.itemWrapper}>
        <TripCard
          trip={item}
          onPress={() => onTripPress(item.id)}
          style={{ width: itemWidth }}
          fallbackCoverUrl={
            item.destination.placeId
              ? destinationPhotos?.get(item.destination.placeId) ?? null
              : null
          }
          author={authorProfiles?.[item.authorUid] ?? null}
        />
      </View>
    ),
    [onTripPress, destinationPhotos, authorProfiles, itemWidth],
  );

  const keyExtractor = useCallback((item: Trip) => item.id, []);

  return (
    <FlatList
      data={trips}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={NUM_COLUMNS}
      columnWrapperStyle={styles.columnWrapper}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.contentContainer,
        { backgroundColor: colors.background.primary },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // itemWidth (twoColumnWidth) assumes Spacing['6'] of horizontal inset on each side —
  // this was previously missing here, so the grid rendered ~48px narrower
  // than the screen with unexplained empty space on the right.
  //
  // Callers: app/(tabs)/explore.tsx and components/profile/TripsGrid (which
  // app/user/[uid] renders) — neither adds its own horizontal padding, so
  // there's no double-padding risk. Because the grid is shared, it
  // deliberately has no ListEmptyComponent: an empty-state CTA belongs to
  // the calling screen, since "Create a trip" is wrong on a profile you
  // don't own. Explore supplies its own.
  contentContainer: {
    gap: Spacing['3'],
    paddingHorizontal: Spacing['6'],
  },
  columnWrapper: {
    gap: Spacing['3'],
  },
  itemWrapper: {
    flex: 1,
  },
});
