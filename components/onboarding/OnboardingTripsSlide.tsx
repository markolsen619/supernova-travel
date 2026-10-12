import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, useWindowDimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { ShowcaseTrip } from '@/hooks/useOnboardingShowcase';
import { KenBurnsImage } from '@/components/onboarding/KenBurnsImage';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { FontWeight } from '@/constants/typography';

interface Props {
  active: boolean;
  /** Supernova's editorial trips (useOnboardingShowcase): no dates, no Upcoming, nobody's real plans. */
  trips: ShowcaseTrip[];
}

/** Height of one card plus its gap — the loop distance depends on it. */
const CARD_HEIGHT = 190;
const CARD_GAP = Spacing['3'];
const ROW = CARD_HEIGHT + CARD_GAP;

/** Seconds per card. Slow enough to read a title, fast enough to feel alive. */
const SECONDS_PER_CARD = 3.2;

/**
 * "Where will you go next?" — Supernova's editorial trips, actually scrolling. Not real users'
 * trips: those carried dates and "Upcoming", and showed someone's actual plans to strangers.
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
export function OnboardingTripsSlide({ active, trips }: Props) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

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
            {looped.map((trip, i) => (
              // Not pressable: this is onboarding, and a card that navigates
              // would drop someone into a trip mid-introduction.
              <View key={`${trip.id}-${i}`} style={styles.card} pointerEvents="none">
                <View style={[styles.cover, { backgroundColor: colors.background.sunken }]}>
                  <Image source={{ uri: trip.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.7)'] as [string, string]}
                    style={styles.coverShade}
                  />
                  <View style={styles.coverText}>
                    <Text style={styles.coverEyebrow} numberOfLines={1}>{trip.eyebrow}</Text>
                    <Text style={styles.coverTitle} numberOfLines={2}>{trip.title}</Text>
                  </View>
                </View>
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
          eyebrow="Discover"
          title="Where will you go next?"
          body="Trips planned by the Supernova team and travelers like you. Save one and make it yours."
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
  cover: { flex: 1, borderRadius: BorderRadius.xl, overflow: 'hidden' },
  coverShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },
  coverText: { position: 'absolute', left: Spacing['4'], right: Spacing['4'], bottom: Spacing['4'], gap: 4 },
  // Photo-anchored text stays white in both themes, over its own shade.
  coverEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  coverTitle: { color: '#ffffff', fontSize: 19, fontWeight: FontWeight.semiBold, letterSpacing: -0.3 },
  fade: { position: 'absolute', left: 0, right: 0, height: 80 },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
