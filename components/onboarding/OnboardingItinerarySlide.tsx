import { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { KenBurnsImage } from '@/components/onboarding/KenBurnsImage';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { SPRING } from '@/constants/motion';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import type { ShowcaseTrip } from '@/hooks/useOnboardingShowcase';
import type { PreviewRow } from '@/utils/onboardingShowcase';

interface Props {
  active: boolean;
  itinerary: { trip: ShowcaseTrip | null; rows: PreviewRow[] } | null;
}

/** Gap between stops appearing — reads as the plan being written, not a list fading in. */
const STAGGER_MS = 420;

/**
 * "A whole trip, planned in seconds" — Day 1 of a real editorial trip, its stops arriving one by
 * one under the trip's cover. The slide's top used to be empty; this is what the app actually makes.
 * Falls back to the static artwork when the trip can't be read (offline, first launch hiccup).
 */
export function OnboardingItinerarySlide({ active, itinerary }: Props) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const rows = itinerary?.rows ?? [];
  const trip = itinerary?.trip ?? null;
  const anims = useRef<Animated.Value[]>([]).current;
  while (anims.length < rows.length) anims.push(new Animated.Value(0));

  useEffect(() => {
    if (!active || rows.length === 0) return;
    if (reduceMotion) {
      anims.forEach((a) => a.setValue(1));
      return;
    }
    anims.forEach((a) => a.setValue(0));
    const seq = Animated.stagger(
      STAGGER_MS,
      anims.slice(0, rows.length).map((a) => Animated.spring(a, { toValue: 1, ...SPRING, useNativeDriver: true })),
    );
    seq.start();
    return () => seq.stop();
  }, [active, reduceMotion, rows.length, anims]);

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.region}>
        {rows.length > 0 && trip ? (
          <View style={styles.planWrap}>
            <View style={[styles.plan, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
              <View style={styles.planCover}>
                <Image source={{ uri: trip.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)'] as [string, string]} style={styles.planShade} />
                <View style={styles.planCoverText}>
                  <Text style={styles.planEyebrow} numberOfLines={1}>{trip.eyebrow}</Text>
                  <Text style={styles.planTitle} numberOfLines={1}>{trip.title}</Text>
                </View>
              </View>
              <Text style={[styles.dayLabel, { color: colors.text.tertiary }]}>DAY 1</Text>
              {rows.map((row, i) => {
                const { Icon, color } = ACTIVITY_ICONS[row.type] ?? ACTIVITY_ICONS.activity;
                const a = anims[i];
                return (
                  <Animated.View
                    key={`${row.title}-${i}`}
                    style={[
                      styles.row,
                      { borderTopColor: colors.background.cardBorder },
                      i === 0 && styles.firstRow,
                      { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
                    ]}
                  >
                    <TypeIconBubble Icon={Icon} color={color} bubbleSize={32} iconSize={17} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: colors.text.primary }]} numberOfLines={1}>{row.title}</Text>
                      {row.place && row.place !== row.title ? (
                        <Text style={[styles.rowPlace, { color: colors.text.secondary }]} numberOfLines={1}>{row.place}</Text>
                      ) : null}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ) : (
          <KenBurnsImage source={require('@/assets/onboarding/ai-plan.png')} active={active} style={StyleSheet.absoluteFillObject} />
        )}
        <LinearGradient
          colors={['transparent', colors.background.primary] as [string, string]}
          style={styles.fadeBottom}
          pointerEvents="none"
        />
      </View>

      <View style={styles.textRegion}>
        <SlideTextBlock
          eyebrow="AI itineraries"
          title="A whole trip, planned in seconds"
          body="Name a place, your dates and how you like to travel. Get a day-by-day plan with real places, ready to change."
          active={active}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  region: { height: '60%', width: '100%', overflow: 'hidden' },
  planWrap: { flex: 1, paddingHorizontal: Spacing['6'], paddingTop: Spacing['6'] },
  plan: { borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', paddingBottom: Spacing['2'] },
  planCover: { height: 120 },
  planShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' },
  planCoverText: { position: 'absolute', left: Spacing['4'], right: Spacing['4'], bottom: Spacing['3'], gap: 2 },
  planEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  planTitle: { color: '#ffffff', fontSize: 17, fontWeight: FontWeight.semiBold },
  dayLabel: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginHorizontal: Spacing['4'], marginTop: Spacing['3'], marginBottom: Spacing['1'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  firstRow: { borderTopWidth: 0 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  rowPlace: { fontSize: 12 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
