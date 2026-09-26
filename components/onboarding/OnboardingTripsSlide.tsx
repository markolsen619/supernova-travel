import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, useWindowDimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { usePublicTrips } from '@/hooks/useTripList';
import { TripCard } from '@/components/trip/TripCard';
import { KenBurnsImage } from '@/components/onboarding/KenBurnsImage';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { Spacing } from '@/constants/spacing';
import type { Trip } from '@/types';

interface Props {
  active: boolean;
}

/** Height of one card plus its gap — the loop distance depends on it. */
const CARD_HEIGHT = 190;
const CARD_GAP = Spacing['3'];
const ROW = CARD_HEIGHT + CARD_GAP;

/** Seconds per card. Slow enough to read a title, fast enough to feel alive. */
const SECONDS_PER_CARD = 3.2;

/**
 * "Find your next trip" — shown with real trips, actually scrolling.
 *
 * A screenshot would have been the obvious answer and the wrong one: it goes
 * stale the moment the content changes, and today it would be a photograph of
 * an almost-empty Explore page. Rendering the real thing means this slide
 * improves on its own as public trips are added, and never lies about what
 * the app contains.
 *
 * Falls back to the static hero when there are no trips to show — during the
 * very first launch, offline, or before any public trip exists. An empty
 * scroller is worse than a photograph.
 */
export function OnboardingTripsSlide({ active }: Props) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const { data: trips = [] } = usePublicTrips(8);

  // Duplicated so the translation can loop without a visible seam: by the
  // time the first copy has scrolled past, the second is in its place.
  const looped = useMemo(() => [...trips, ...trips], [trips]);
  const scroll = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduceMotion || trips.length === 0) return;

    const distance = trips.length * ROW;
    scroll.setValue(0);
    const animation = Animated.loop(
      Animated.timing(scroll, {
        toValue: -distance,
        duration: trips.length * SECONDS_PER_CARD * 1000,
        easing: Easing.linear, // constant speed — an eased loop visibly stutters at the seam
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, trips.length, scroll]);

  const hasTrips = trips.length > 0;

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.region}>
        {hasTrips ? (
          <Animated.View style={{ transform: [{ translateY: scroll }] }}>
            {looped.map((trip: Trip, i) => (
              // Not pressable: this is onboarding, and a card that navigates
              // would drop someone into a trip mid-introduction.
              <View key={`${trip.id}-${i}`} style={styles.card} pointerEvents="none">
                <TripCard trip={trip} onPress={() => {}} />
              </View>
            ))}
          </Animated.View>
        ) : (
          <KenBurnsImage
            source={require('@/assets/onboarding/explore.png')}
            active={active}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Top and bottom fades, so cards enter and leave rather than being
            cut off by the edge of the region. */}
        <LinearGradient
          colors={[colors.background.primary, 'transparent'] as [string, string]}
          style={[styles.fade, styles.fadeTop]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', colors.background.primary] as [string, string]}
          style={[styles.fade, styles.fadeBottom]}
          pointerEvents="none"
        />
      </View>

      <View style={styles.textRegion}>
        <SlideTextBlock
          eyebrow="Explore"
          title="Find your next trip"
          body="Scroll real itineraries from other travelers and save the ones that catch your eye."
          active={active}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  region: { height: '60%', width: '100%', overflow: 'hidden' },
  card: { height: CARD_HEIGHT, marginBottom: CARD_GAP, paddingHorizontal: Spacing['6'] },
  fade: { position: 'absolute', left: 0, right: 0, height: 80 },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
