import React, { useCallback } from 'react';
import { FlatList, View, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { TripCard } from '@/components/trip/TripCard';
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
}

export function TripGrid({ trips, onTripPress }: TripGridProps) {
  const { colors } = useTheme();

  const renderItem = useCallback(
    ({ item }: { item: Trip }) => (
      <View style={styles.itemWrapper}>
        <TripCard
          trip={item}
          onPress={() => onTripPress(item.id)}
          style={{ width: ITEM_WIDTH }}
        />
      </View>
    ),
    [onTripPress],
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
  contentContainer: {
    gap: Spacing['3'],
  },
  columnWrapper: {
    gap: Spacing['3'],
  },
  itemWrapper: {
    flex: 1,
  },
});
