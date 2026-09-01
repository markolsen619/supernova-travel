import React, { useCallback } from 'react';
import { FlatList, View, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { TripCard } from '@/components/trip/TripCard';
import type { AuthorInfo } from '@/hooks/useAuthorProfiles';
import { Spacing } from '@/constants/spacing';
import { Trip } from '@/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 2;
const HORIZONTAL_PADDING = Spacing['6'] * 2;
const COLUMN_GAP = Spacing['3'];
const ITEM_WIDTH =
  (SCREEN_WIDTH - HORIZONTAL_PADDING - COLUMN_GAP) / NUM_COLUMNS;

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

  const renderItem = useCallback(
    ({ item }: { item: Trip }) => (
      <View style={styles.itemWrapper}>
        <TripCard
          trip={item}
          onPress={() => onTripPress(item.id)}
          style={{ width: ITEM_WIDTH }}
          fallbackCoverUrl={
            item.destination.placeId
              ? destinationPhotos?.get(item.destination.placeId) ?? null
              : null
          }
          author={authorProfiles?.[item.authorUid] ?? null}
        />
      </View>
    ),
    [onTripPress, destinationPhotos, authorProfiles],
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
  // ITEM_WIDTH above assumes Spacing['6'] of horizontal inset on each side —
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
