import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, MagnifyingGlass } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { usePlaceAutocomplete } from '@/hooks/usePlaceAutocomplete';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { placeFromSelection, placeToTripActivity } from '@/services/places/googlePlaces';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import { PlaceResult } from '@/components/search/PlaceResult';
import { PlaceDetailSheet } from '@/components/search/PlaceDetailSheet';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

interface AddStopSheetProps {
  visible: boolean;
  tripId: string;
  dayId: string;
  dayNumber: number;
  onClose: () => void;
}

/**
 * "Add stop to this day" (Phase 4, Part B) — reuses the same building blocks
 * as the Search tab's Flow A (usePlaceAutocomplete with richDetails, the
 * PlaceResult row, and PlaceDetailSheet itself) rather than a second
 * autocomplete/Places integration. The only new markup here is the modal
 * shell + search bar, matching search.tsx's own layout.
 */
export function AddStopSheet({ visible, tripId, dayId, dayNumber, onClose }: AddStopSheetProps) {
  const { colors } = useTheme();
  const { height } = useLayout();
  const { addActivity } = useCreateTrip();
  const {
    query,
    setQuery,
    suggestions,
    isLoading,
    error,
    selectPlace,
    clearQuery,
  } = usePlaceAutocomplete(350, { richDetails: true });

  const [previewPlace, setPreviewPlace] = useState<EnrichedPlace | null>(null);
  const [adding, setAdding] = useState(false);
  const slideAnim = useRef(new Animated.Value(height)).current;

  const showPreview = useCallback(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      ...SPRING,
    }).start();
  }, [slideAnim]);

  const hidePreview = useCallback(() => {
    Animated.spring(slideAnim, {
      toValue: height,
      ...SPRING,
    }).start(() => setPreviewPlace(null));
  }, [slideAnim, height]);

  const handleSelectResult = useCallback(
    async (placeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const sel = await selectPlace(placeId);
        const enriched = placeFromSelection(sel);
        if (!enriched) return;
        setPreviewPlace(enriched);
        showPreview();
      } catch (err) {
        console.error('[AddStopSheet] select failed:', err);
      }
    },
    [selectPlace, showPreview],
  );

  const handleAddToThisDay = useCallback(
    async (place: EnrichedPlace) => {
      if (adding) return;
      setAdding(true);
      try {
        await addActivity(tripId, dayId, placeToTripActivity(place));
        hidePreview();
        setQuery('');
        clearQuery();
        onClose();
      } catch (err) {
        console.error('[AddStopSheet] add failed:', err);
      } finally {
        setAdding(false);
      }
    },
    [adding, addActivity, tripId, dayId, hidePreview, setQuery, clearQuery, onClose],
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery('');
    clearQuery();
    hidePreview();
    onClose();
  }, [setQuery, clearQuery, hidePreview, onClose]);

  const handleClearQuery = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearQuery();
  }, [clearQuery]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Add stop to day {dayNumber}
          </Text>
          <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
            <X size={22} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
          <MagnifyingGlass size={18} color={colors.text.tertiary} weight="bold" />
          <TextInput
            style={[styles.searchInput, { color: colors.text.primary }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a place…"
            placeholderTextColor={colors.text.tertiary}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClearQuery} hitSlop={8} accessibilityLabel="Clear search">
              <X size={16} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand.purple} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
              Search failed. Check your connection and try again.
            </Text>
          </View>
        ) : query.trim().length < 2 ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
              Search for a restaurant, museum, hotel — anywhere.
            </Text>
          </View>
        ) : suggestions.length === 0 ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
              {`No results for "${query}"`}
            </Text>
          </View>
        ) : (
          <View style={styles.resultsList}>
            {suggestions.map((s) => (
              <PlaceResult
                key={s.placeId}
                placeId={s.placeId}
                mainText={s.mainText}
                secondaryText={s.secondaryText}
                onPress={handleSelectResult}
              />
            ))}
          </View>
        )}

        {/* Place preview + confirm — reused PlaceDetailSheet, scoped to this day */}
        {previewPlace ? (
          <PlaceDetailSheet
            place={previewPlace}
            slideAnim={slideAnim}
            bottomInset={Platform.OS === 'ios' ? 24 : 12}
            onDismiss={hidePreview}
            onAddToTrip={handleAddToThisDay}
            addToTripLabel={adding ? 'Adding…' : `Add to Day ${dayNumber}`}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['5'],
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: Spacing['4'],
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginHorizontal: Spacing['5'],
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    marginBottom: Spacing['3'],
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.base,
    paddingVertical: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
  },
  emptyText: {
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  resultsList: { flex: 1 },
});
