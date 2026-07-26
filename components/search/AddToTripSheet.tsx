import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { CheckCircle, MapPin, Plus, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeColors } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTripList } from '@/hooks/useTripList';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { placeToTripActivity } from '@/services/places/googlePlaces';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import type { Trip } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface Props {
  visible: boolean;
  place: EnrichedPlace;
  onClose: () => void;
  /**
   * Override the resolved theme palette — this sheet is reachable from
   * search.tsx's always-dark globe (via PlaceDetailSheet's default "Add to
   * Trip" path), where useTheme() would otherwise follow the user's
   * light/dark app setting instead of staying pinned dark. Its own chrome
   * (BlurView, Android background) was already hardcoded dark regardless —
   * this override just brings the text/icon colors into agreement with it.
   */
  colors?: ThemeColors;
}

export function AddToTripSheet({ visible, place, onClose, colors: colorsOverride }: Props) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: trips, isLoading } = useTripList(uid);
  const { createTrip, addDay, addActivity, getOrCreateLastDay } = useCreateTrip();

  const [adding, setAdding] = useState(false);
  const [addedTripTitle, setAddedTripTitle] = useState<string | null>(null);

  // Reset transient state each time the sheet is (re)opened for a new place.
  useEffect(() => {
    if (visible) {
      setAdding(false);
      setAddedTripTitle(null);
    }
  }, [visible, place.placeId]);

  const handleAddToTrip = useCallback(
    async (trip: Trip) => {
      if (adding) return;
      setAdding(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const dayId = await getOrCreateLastDay(trip.id);
        await addActivity(trip.id, dayId, placeToTripActivity(place));
        setAddedTripTitle(trip.title);
      } catch (err) {
        console.error('[AddToTripSheet] add to existing trip failed:', err);
        setAdding(false);
      }
    },
    [adding, place, getOrCreateLastDay, addActivity],
  );

  const handleCreateAndAdd = useCallback(async () => {
    if (adding) return;
    setAdding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const title = `Trip to ${place.name}`;
      const tripId = await createTrip({
        title,
        description: '',
        destination: {
          name: place.name,
          placeId: place.placeId,
          lat: place.lat,
          lng: place.lng,
          countryCode: place.countryCode,
        },
        // Quick-create shortcut from a search result — single destination by
        // design, not the full multi-destination wizard.
        additionalDestinations: [],
        startDate: null,
        endDate: null,
        // Private by default — this is a quick-create shortcut, not the full
        // wizard, so we don't publish it on the user's behalf.
        visibility: 'private',
        tags: [],
        coverImageUrl: null,
        isAiGenerated: false,
      });
      const dayId = await addDay(tripId, { dayNumber: 1, date: null, title: '', notes: '' });
      await addActivity(tripId, dayId, placeToTripActivity(place));
      setAddedTripTitle(title);
    } catch (err) {
      console.error('[AddToTripSheet] create + add failed:', err);
      setAdding(false);
    }
  }, [adding, place, createTrip, addDay, addActivity]);

  // Auto-dismiss shortly after a successful add so the confirmation reads,
  // then close — matches the sheet's own spring-dismiss feel.
  useEffect(() => {
    if (!addedTripTitle) return;
    const timer = setTimeout(onClose, 1100);
    return () => clearTimeout(timer);
  }, [addedTripTitle, onClose]);

  const renderTripRow = useCallback(
    ({ item }: { item: Trip }) => (
      <TouchableOpacity
        style={[styles.tripRow, { borderColor: colors.background.cardBorder }]}
        onPress={() => handleAddToTrip(item)}
        activeOpacity={0.7}
        disabled={adding}
      >
        <View style={[styles.tripIconBubble, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
          <MapPin size={18} color={colors.brand.purple} weight="duotone" />
        </View>
        <View style={styles.tripTextBlock}>
          <Text style={[styles.tripTitle, { color: colors.text.primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.tripSubtitle, { color: colors.text.tertiary }]} numberOfLines={1}>
            {item.destination.name}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [colors, adding, handleAddToTrip],
  );

  const content = () => {
    if (addedTripTitle) {
      return (
        <View style={styles.successWrap}>
          <CheckCircle size={40} color={colors.semantic.success} weight="duotone" />
          <Text style={[styles.successText, { color: colors.text.primary }]}>
            Added to {addedTripTitle}
          </Text>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }

    return (
      <>
        <TouchableOpacity
          style={[styles.newTripRow, { borderColor: colors.brand.purple }]}
          onPress={handleCreateAndAdd}
          activeOpacity={0.7}
          disabled={adding}
        >
          <View style={[styles.tripIconBubble, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
            <Plus size={18} color={colors.brand.purple} weight="bold" />
          </View>
          <Text style={[styles.newTripText, { color: colors.brand.purple }]}>
            New trip to {place.name}
          </Text>
          {adding && <ActivityIndicator size="small" color={colors.brand.purple} />}
        </TouchableOpacity>

        {trips && trips.length > 0 ? (
          <FlashList
            data={trips}
            renderItem={renderTripRow}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
              You don&apos;t have any trips yet — create one above.
            </Text>
          </View>
        )}
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheetWrap}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={90} tint="dark" style={styles.fill}>
              <SheetBody onClose={onClose} colors={colors}>
                {content()}
              </SheetBody>
            </BlurView>
          ) : (
            <View style={[styles.fill, styles.androidBg]}>
              <SheetBody onClose={onClose} colors={colors}>
                {content()}
              </SheetBody>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SheetBody({
  children,
  onClose,
  colors,
}: {
  children: React.ReactNode;
  onClose: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.body}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Add to Trip</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <X size={20} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: {
    maxHeight: '70%',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  androidBg: { backgroundColor: 'rgba(10,10,26,0.97)' },

  body: { padding: Spacing['5'], gap: Spacing['4'], minHeight: 220 },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  newTripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    backgroundColor: 'rgba(167,139,250,0.08)',
  },
  newTripText: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semiBold },

  listContent: { paddingTop: Spacing['2'], paddingBottom: Spacing['4'] },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing['3'],
  },
  tripIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripTextBlock: { flex: 1 },
  tripTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  tripSubtitle: { fontSize: FontSize.sm, marginTop: 2 },

  loadingWrap: { paddingVertical: Spacing['8'], alignItems: 'center' },
  emptyWrap: { paddingVertical: Spacing['6'], alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center' },

  successWrap: { alignItems: 'center', gap: Spacing['3'], paddingVertical: Spacing['8'] },
  successText: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
