/**
 * A catalog destination: its photo, what it's like, the itineraries that go
 * there (Supernova picks first, then travelers'), and the places those
 * itineraries keep including. One action — plan a trip here with AI.
 *
 * Navigated to via router.push('/destination/<slug>') from Explore, a globe
 * pin, or a search row. Reads the cached catalog (useDestinations), so a cold
 * deep link loads it too.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Compass, MapPin, MapTrifold } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { useDestination, useDestinationTrips } from '@/hooks/useDestinations';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { TripCard } from '@/components/trip/TripCard';
import { PlaceDetailSheet } from '@/components/search/PlaceDetailSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { SkeletonBlock, SkeletonCard } from '@/components/ui/Skeleton';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { SPRING } from '@/constants/motion';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import {
  REGION_CHIPS, VIBE_CHIPS, placeShare, topPlaceToPlace, type TopPlace,
} from '@/utils/destinations';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import type { Trip } from '@/types';

const HERO_HEIGHT = 360;
const SHEET_CLOSED = 600;

export default function DestinationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { cardListColumns } = useLayout();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { destination, isLoading } = useDestination(slug ?? '');
  const { editorial, community, isLoading: tripsLoading } = useDestinationTrips(slug ?? '');
  const allTrips = useMemo(() => [...editorial, ...community], [editorial, community]);
  const { data: authors = {} } = useAuthorProfiles(allTrips.map((t) => t.authorUid));

  const [photoFailed, setPhotoFailed] = useState(false);
  const [place, setPlace] = useState<EnrichedPlace | null>(null);
  const placeSlide = useRef(new Animated.Value(SHEET_CLOSED)).current;

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const openPlace = useCallback((p: TopPlace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlace(topPlaceToPlace(p));
    Animated.spring(placeSlide, { toValue: 0, ...SPRING }).start();
  }, [placeSlide]);

  const closePlace = useCallback(() => {
    Animated.spring(placeSlide, { toValue: SHEET_CLOSED, ...SPRING }).start(() => setPlace(null));
  }, [placeSlide]);

  const planHere = useCallback(() => {
    if (!destination) return;
    router.push({
      pathname: '/trip/ai-generate',
      params: {
        destination: destination.name,
        countryCode: destination.countryCode,
        // An empty string would reach the form as a "place" — omit it instead.
        ...(destination.placeId ? { placeId: destination.placeId } : {}),
      },
    });
  }, [destination]);

  const openTrip = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${id}`);
  }, []);

  const backButton = (
    <TouchableOpacity
      onPress={handleBack}
      style={[styles.back, { top: insets.top + Spacing['2'], backgroundColor: 'rgba(0,0,0,0.35)' }]}
      accessibilityLabel="Back"
      hitSlop={6}
    >
      <ArrowLeft size={20} color="#fff" weight="bold" />
    </TouchableOpacity>
  );

  // ── Loading: skeleton in the page's own shape ──
  if (isLoading && !destination) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
        <SkeletonBlock height={HERO_HEIGHT} radius={0} />
        <View style={styles.body}>
          <SkeletonBlock width={120} height={12} />
          <SkeletonBlock width={220} height={30} />
          <SkeletonBlock height={52} radius={BorderRadius.lg} />
        </View>
        {backButton}
      </View>
    );
  }

  // ── Unknown slug (catalog loaded, no such destination) ──
  if (!destination) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
        <EmptyState
          icon={Compass}
          title="This destination isn't in our guide yet"
          description="Explore has every place we cover."
          actionLabel="Back to Explore"
          onAction={handleBack}
          actionHaptic="light"
        />
      </View>
    );
  }

  const regionLabel = REGION_CHIPS.find((r) => r.id === destination.continentChip)?.label ?? '';
  const eyebrow = [destination.countryName, regionLabel].filter(Boolean).join(' · ').toUpperCase();
  const vibeLabels = destination.vibes
    .map((v) => VIBE_CHIPS.find((c) => c.id === v)?.label)
    .filter((l): l is string => !!l);
  const showPhoto = !!destination.coverImageUrl && !photoFailed;
  const cardWidthPct = `${100 / Math.max(1, cardListColumns)}%` as const;

  const renderTrip = (trip: Trip, pick: boolean) => {
    const author = authors[trip.authorUid];
    return (
      <View key={trip.id} style={[styles.tripCell, { width: cardWidthPct }]}>
        <TripCard
          trip={trip}
          onPress={() => openTrip(trip.id)}
          author={author ? { name: author.name, avatarUrl: author.avatarUrl } : null}
          fallbackCoverUrl={destination.coverImageUrl}
        />
        {pick ? (
          <View style={[styles.pick, { backgroundColor: colors.text.primary }]} pointerEvents="none">
            <Text style={[styles.pickText, { color: colors.background.primary }]}>SUPERNOVA PICK</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenEntrance>
      <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {/* ── Hero ── */}
          <View style={[styles.hero, { backgroundColor: colors.background.sunken }]}>
            {showPhoto ? (
              <>
                <Image
                  source={{ uri: destination.coverImageUrl! }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  onError={() => setPhotoFailed(true)}
                  accessibilityIgnoresInvertColors
                />
                <LinearGradient
                  colors={['rgba(0,0,0,0.25)', 'transparent'] as [string, string]}
                  locations={[0, 0.35] as [number, number]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <MapPin size={40} color={colors.text.disabled} weight="duotone" />
              </View>
            )}
          </View>
          {showPhoto ? (
            <Text style={[styles.attribution, { color: colors.text.tertiary }]}>Powered by Google</Text>
          ) : null}

          <View style={styles.body}>
            {/* ── Title block ── */}
            <View style={styles.titleBlock}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{eyebrow}</Text>
              <Text style={[styles.title, { color: colors.text.primary }]} accessibilityRole="header">
                {destination.name}
              </Text>
              {vibeLabels.length > 0 ? (
                <View style={styles.tags}>
                  {vibeLabels.map((label) => (
                    <View key={label} style={[styles.tag, { backgroundColor: colors.background.sunken }]}>
                      <Text style={[styles.tagText, { color: colors.text.secondary }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <Button label="Plan my trip here" variant="hero" size="lg" onPress={planHere} />

            {/* ── Itineraries ── */}
            {tripsLoading ? (
              <View style={styles.section}>
                <SkeletonBlock width={140} height={12} />
                <SkeletonCard width="100%" height={200} radius={BorderRadius.xl} />
              </View>
            ) : allTrips.length === 0 ? (
              <EmptyState
                icon={MapTrifold}
                title="Be the first to share a trip here"
                description="Plan one with AI or by hand, set it to public, and it shows up on this page."
                actionLabel="Plan my trip here"
                onAction={planHere}
                size="sm"
              />
            ) : (
              <>
                {editorial.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>SUPERNOVA PICKS</Text>
                    <View style={styles.tripGrid}>{editorial.map((t) => renderTrip(t, true))}</View>
                  </View>
                ) : null}
                {community.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>FROM TRAVELERS</Text>
                    <View style={styles.tripGrid}>{community.map((t) => renderTrip(t, false))}</View>
                  </View>
                ) : null}
              </>
            )}

            {/* ── Places to go ── */}
            {destination.topPlaces.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>PLACES TO GO</Text>
                {destination.topPlaces.map((p, i) => {
                  const { Icon, color } = ACTIVITY_ICONS[p.type];
                  return (
                    <TouchableOpacity
                      key={`${p.name}-${i}`}
                      onPress={() => openPlace(p)}
                      style={[styles.placeRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.background.cardBorder }]}
                      accessibilityLabel={`${p.name}. ${placeShare(p, destination.itineraryCount)}`}
                    >
                      <TypeIconBubble Icon={Icon} color={color} />
                      <View style={styles.placeText}>
                        <Text style={[styles.placeName, { color: colors.text.primary }]} numberOfLines={1}>{p.name}</Text>
                        <Text style={[styles.placeMeta, { color: colors.text.tertiary }]}>
                          {placeShare(p, destination.itineraryCount)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        </ScrollView>

        {backButton}

        {place ? (
          <PlaceDetailSheet
            place={place}
            slideAnim={placeSlide}
            bottomInset={insets.bottom}
            onDismiss={closePlace}
          />
        ) : null}
      </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: { height: HERO_HEIGHT, overflow: 'hidden' },
  back: {
    position: 'absolute',
    left: Spacing['5'],
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attribution: { fontSize: FontSize.xs, paddingHorizontal: Spacing['5'], marginTop: Spacing['2'] },
  body: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], gap: Spacing['6'] },
  titleBlock: { gap: Spacing['2'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.08 * 11 },
  title: { fontSize: 30, fontWeight: FontWeight.semiBold, letterSpacing: -0.02 * 30 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'], marginTop: Spacing['1'] },
  tag: { paddingHorizontal: Spacing['3'], paddingVertical: 6, borderRadius: 999 },
  tagText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  section: { gap: Spacing['3'] },
  sectionTitle: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.08 * 11 },
  tripGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing['2'] },
  tripCell: { paddingHorizontal: Spacing['2'], paddingBottom: Spacing['4'] },
  pick: {
    position: 'absolute',
    top: Spacing['3'],
    left: Spacing['2'] + Spacing['3'],
    paddingHorizontal: Spacing['2'],
    paddingVertical: 4,
    borderRadius: 999,
  },
  pickText: { fontSize: 10, fontWeight: FontWeight.semiBold, letterSpacing: 0.08 * 10 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 56, paddingVertical: Spacing['2'] },
  placeText: { flex: 1, gap: 2 },
  placeName: { fontSize: 15, fontWeight: FontWeight.medium },
  placeMeta: { fontSize: 13 },
});
