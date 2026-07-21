import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { MapPin, X, ArrowRight, NavigationArrow, Star, Clock, Plus } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeColors } from '@/constants/colors';
import { usePlacesStore, type EnrichedPlace } from '@/stores/usePlacesStore';
import { enrichPlaceById, photoUrl } from '@/services/places/googlePlaces';
import { AddToTripSheet } from '@/components/search/AddToTripSheet';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface Props {
  place: EnrichedPlace;
  slideAnim: Animated.Value;
  bottomInset: number;
  onDismiss: () => void;
  /**
   * When provided, the "Add to Trip" button calls this directly instead of
   * opening the trip-picker AddToTripSheet — used when the sheet is already
   * scoped to a specific trip/day (e.g. Phase 4's "Add stop to this day"),
   * where asking the user to pick a trip again would be redundant. Omit to
   * keep the default Search-tab behavior (open the trip picker).
   */
  onAddToTrip?: (place: EnrichedPlace) => void;
  /** Overrides the "Add to Trip" button label — e.g. "Add to This Day". */
  addToTripLabel?: string;
  /**
   * Override the resolved theme palette — search.tsx renders this sheet over
   * its always-dark globe, where useTheme() would otherwise follow the
   * user's light/dark app setting instead of staying pinned dark. Omit for
   * the normal theme-reactive case (e.g. AddStopSheet's light-chrome use).
   * Propagated to the nested AddToTripSheet when it's the one rendering.
   */
  colors?: ThemeColors;
}

// Google returns this Monday-first, one line per day — map JS's Sunday-first
// getDay() (0=Sun..6=Sat) onto it to pull out "today's" line only.
function todaysHoursLine(openingHours: string[] | undefined): string | null {
  if (!openingHours || openingHours.length !== 7) return null;
  const jsDay = new Date().getDay();
  const mondayFirstIndex = (jsDay + 6) % 7;
  return openingHours[mondayFirstIndex] ?? null;
}

const PRICE_LEVEL_LABELS: Record<string, string> = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

function humanizeType(primaryType: string | null | undefined): string | null {
  if (!primaryType) return null;
  return primaryType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function PlaceDetailSheet({
  place,
  slideAnim,
  bottomInset,
  onDismiss,
  onAddToTrip,
  addToTripLabel,
  colors: colorsOverride,
}: Props) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const { getPlace, setPlace } = usePlacesStore();

  // Local display copy — starts as whatever was just selected/tapped, then
  // upgraded in place once the tier2 (photos/rating/hours/summary) fetch
  // resolves. Kept separate from the store's selectedPlace so the sheet can
  // render richer data without search.tsx needing to re-render around it.
  const [displayPlace, setDisplayPlace] = useState<EnrichedPlace>(place);
  const [enrichingTier2, setEnrichingTier2] = useState(false);
  const [addToTripVisible, setAddToTripVisible] = useState(false);

  useEffect(() => {
    setDisplayPlace(place);

    if (place.tier === 'tier2') return; // already rich

    // Cache-first: Flow B (POI tap) may have already tier2-upgraded this exact
    // placeId; reuse it rather than firing a second billed Details call.
    const cached = getPlace(place.placeId);
    if (cached?.tier === 'tier2') {
      setDisplayPlace(cached);
      return;
    }

    let cancelled = false;
    setEnrichingTier2(true);
    enrichPlaceById(place.placeId)
      .then((tier2Fields) => {
        if (cancelled || !tier2Fields) return;
        const upgraded: EnrichedPlace = { ...place, ...tier2Fields, tier: 'tier2' };
        setPlace(upgraded);
        setDisplayPlace(upgraded);
      })
      .catch((err) => console.error('[PlaceDetailSheet] tier2 enrich failed:', err))
      .finally(() => {
        if (!cancelled) setEnrichingTier2(false);
      });

    return () => {
      cancelled = true;
    };
  }, [place, getPlace, setPlace]);

  const handlePlanTrip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/trip/ai-generate',
      params: {
        destination: displayPlace.name,
        countryCode: displayPlace.countryCode ?? '',
        placeId: displayPlace.placeId,
      },
    });
  }, [displayPlace]);

  const handleOpenAddToTrip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onAddToTrip) {
      onAddToTrip(displayPlace);
    } else {
      setAddToTripVisible(true);
    }
  }, [onAddToTrip, displayPlace]);

  const handleCloseAddToTrip = useCallback(() => setAddToTripVisible(false), []);

  const typeLabel = humanizeType(displayPlace.primaryType);
  const hoursLine = todaysHoursLine(displayPlace.openingHours);
  const priceLabel = displayPlace.priceLevel ? PRICE_LEVEL_LABELS[displayPlace.priceLevel] : null;
  const hasPhotos = !!displayPlace.photoNames && displayPlace.photoNames.length > 0;

  const sheetContent = (
    <View style={[styles.content, { paddingBottom: bottomInset + Spacing['4'] }]}>
      <View style={styles.handle} />

      {/* Place identity row — the "ABOUT THIS PLACE" eyebrow deliberately
          mirrors JournalSheet's "YOUR VISIT" one: Google's public place data
          vs. the owner's personal photos/note are two different things, and
          this is the one visual cue guaranteed to appear on both sheets. */}
      <View style={styles.header}>
        <View style={styles.iconBubble}>
          <MapPin size={22} color={colors.brand.purple} weight="duotone" />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>ABOUT THIS PLACE</Text>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
            {displayPlace.name}
          </Text>
          {typeLabel ? (
            <Text style={[styles.typeLabel, { color: colors.brand.purple }]} numberOfLines={1}>
              {typeLabel}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={12} style={styles.dismissBtn}>
          <X size={18} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>

      {displayPlace.address ? (
        <Text style={[styles.secondary, { color: colors.text.tertiary }]} numberOfLines={1}>
          {displayPlace.address}
        </Text>
      ) : displayPlace.countryCode ? (
        <Text style={[styles.secondary, { color: colors.text.tertiary }]}>
          {displayPlace.countryCode}
        </Text>
      ) : null}

      {/* Photo rail — lazy: URLs are only built once photoNames exist */}
      {hasPhotos ? (
        <View style={styles.photoRail}>
          <FlashList
            horizontal
            data={displayPlace.photoNames}
            keyExtractor={(name) => name}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Image
                source={{ uri: photoUrl(item, 600) }}
                style={styles.photo}
                resizeMode="cover"
              />
            )}
          />
        </View>
      ) : enrichingTier2 ? (
        <View style={styles.photoRailSkeleton}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.photoSkeletonBox, { backgroundColor: colors.background.card }]}
            />
          ))}
        </View>
      ) : null}

      {/* Rating + price row */}
      {displayPlace.rating != null ? (
        <View style={styles.metaRow}>
          <Star size={16} color={colors.accent.amber} weight="duotone" />
          <Text style={[styles.metaText, { color: colors.text.primary }]}>
            {displayPlace.rating.toFixed(1)}
          </Text>
          {displayPlace.userRatingCount != null ? (
            <Text style={[styles.metaMuted, { color: colors.text.tertiary }]}>
              ({displayPlace.userRatingCount.toLocaleString()})
            </Text>
          ) : null}
          {priceLabel ? (
            <Text style={[styles.metaMuted, { color: colors.text.tertiary }]}>· {priceLabel}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Today's hours */}
      {hoursLine ? (
        <View style={styles.metaRow}>
          <Clock size={16} color={colors.accent.teal} weight="duotone" />
          <Text style={[styles.metaText, { color: colors.text.secondary }]} numberOfLines={1}>
            {hoursLine}
          </Text>
        </View>
      ) : null}

      {/* Editorial summary */}
      {displayPlace.summary ? (
        <Text style={[styles.summary, { color: colors.text.secondary }]} numberOfLines={4}>
          {displayPlace.summary}
        </Text>
      ) : null}

      {/* CTAs */}
      <TouchableOpacity
        style={[styles.planBtn, { backgroundColor: colors.brand.purple }]}
        onPress={handlePlanTrip}
        activeOpacity={0.85}
      >
        <NavigationArrow size={18} color="#ffffff" weight="bold" />
        <Text style={styles.planBtnText}>Plan a Trip Here</Text>
        <ArrowRight size={16} color="rgba(255,255,255,0.7)" weight="bold" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addToTripBtn, { borderColor: colors.brand.purple }]}
        onPress={handleOpenAddToTrip}
        activeOpacity={0.85}
      >
        <Plus size={18} color={colors.brand.purple} weight="bold" />
        <Text style={[styles.addToTripBtnText, { color: colors.brand.purple }]}>
          {addToTripLabel ?? 'Add to Trip'}
        </Text>
      </TouchableOpacity>

      {/* Required Google attribution — must appear whenever Google place data is shown */}
      <Text style={[styles.attribution, { color: colors.text.tertiary }]}>
        Powered by Google
      </Text>
    </View>
  );

  return (
    <>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={80} tint="dark" style={styles.fill}>
            {sheetContent}
          </BlurView>
        ) : (
          <View style={[styles.fill, styles.androidBg]}>
            {sheetContent}
          </View>
        )}
      </Animated.View>

      {onAddToTrip ? null : (
        <AddToTripSheet
          visible={addToTripVisible}
          place={displayPlace}
          onClose={handleCloseAddToTrip}
          colors={colorsOverride}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: BorderRadius['2xl'] ?? 24,
    borderTopRightRadius: BorderRadius['2xl'] ?? 24,
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  androidBg: { backgroundColor: 'rgba(10,10,26,0.96)' },

  content: { padding: Spacing['5'], gap: Spacing['3'] },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing['2'],
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
    marginBottom: 2,
  },
  name: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  typeLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, marginTop: 2 },
  secondary: { fontSize: FontSize.sm, marginTop: -Spacing['2'] },
  dismissBtn: { padding: Spacing['2'] },

  photoRail: { height: 140 },
  photo: {
    width: 200,
    height: 140,
    borderRadius: BorderRadius.lg,
    marginRight: Spacing['2'],
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  photoRailSkeleton: { flexDirection: 'row', gap: Spacing['2'], height: 140 },
  photoSkeletonBox: { width: 200, height: 140, borderRadius: BorderRadius.lg },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['1'] },
  metaText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  metaMuted: { fontSize: FontSize.sm },

  summary: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.5 },

  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['5'],
    marginTop: Spacing['1'],
  },
  planBtnText: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#ffffff',
  },

  addToTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['5'],
    backgroundColor: 'rgba(167,139,250,0.08)',
  },
  addToTripBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  attribution: {
    fontSize: FontSize.xs ?? 11,
    textAlign: 'center',
    marginTop: -Spacing['2'],
  },
});
