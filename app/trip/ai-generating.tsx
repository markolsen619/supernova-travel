import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { WarningCircle } from 'phosphor-react-native';
import { FirebaseError } from 'firebase/app';
import { AiGeneratingAnimation } from '@/components/trip/AiGeneratingAnimation';
import { useAiGenerateTrip } from '@/hooks/useAiGenerateTrip';
import { GenerateTripRequest } from '@/types/ai';
import { DarkColors, LightColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import { useDestinations } from '@/hooks/useDestinations';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { KenBurnsImage } from '@/components/onboarding/KenBurnsImage';
import { catalogFor, generatingMessages, messageIndexAt, progressAt, waitCardAt, waitCards } from '@/utils/generatingStory';
import { parseTravelStyles, parseTripVisibility } from '@/utils/aiRouteParams';

// ─── Destination display ──────────────────────────────────────────────────────

/** Comma-joined "A, B & C" formatting for the loading screen — same join
 * pattern app/trip/new.tsx's auto-title already uses, duplicated here
 * rather than extracted (this codebase's established convention for small,
 * single-call-site date/string helpers — see the multi-destination-trips
 * and AI-generate-dates plans' self-review notes). */
function formatDestinationDisplay(primary: string, additionalJson: string | undefined): string {
  let additional: { name: string }[] = [];
  try {
    additional = JSON.parse(additionalJson ?? '[]');
  } catch {
    additional = [];
  }
  const allNames = [primary, ...additional.map((d) => d.name)].filter(Boolean);
  if (allNames.length <= 1) return allNames[0] || 'your destination';
  return allNames.join(', ').replace(/, ([^,]*)$/, ' & $1');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AiGeneratingScreen() {
  const params = useLocalSearchParams<{
    destination: string;
    countryCode: string;
    /** The picked place, so the trip keeps it (see functions/src/tripDocs.ts). Optional. */
    placeId?: string;
    lat?: string;
    lng?: string;
    additionalDestinations: string;
    durationDays: string;
    travelStyle: string;
    travelStyles: string;
    pace: string;
    visibility: string;
    mustSee: string;
    preferences: string;
    startDate: string;
    endDate: string;
  }>();

  const { generateTrip, isPending, error } = useAiGenerateTrip();
  const destinationDisplay = formatDestinationDisplay(params.destination, params.additionalDestinations);

  const [elapsed, setElapsed] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduceMotion = useReduceMotion();

  // The wait as a story (utils/generatingStory): their city and styles, ~90 s of steps, cards that teach the app.
  const { destinations } = useDestinations();
  const catalog = useMemo(
    () => catalogFor(destinations, params.destination ?? '', params.lat ? Number(params.lat) : null, params.lng ? Number(params.lng) : null),
    [destinations, params.destination, params.lat, params.lng],
  );
  const messages = useMemo(
    () => generatingMessages(params.destination || 'your destination', parseTravelStyles(params.travelStyles, params.travelStyle)),
    [params.destination, params.travelStyles, params.travelStyle],
  );
  const cards = useMemo(() => waitCards((catalog?.topPlaces ?? []).map((p) => p.name)), [catalog]);
  const status = finishing ? 'Your trip is ready' : messages[messageIndexAt(elapsed, messages.length)];
  const card = waitCardAt(cards, elapsed);
  const cardAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    cardAnim.setValue(0);
    Animated.spring(cardAnim, { toValue: 1, ...SPRING }).start();
  }, [card, cardAnim]);

  // ── Light → dark transition (signature moment) ───────────────────────────
  // The intake form is light chrome; this screen is the one deliberately-dark
  // immersive moment it leads into. A hard cut would feel like a glitch, so
  // this fades a light-canvas-colored overlay out while the content
  // materializes (fade + scale) underneath, on mount only.
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 550,
      useNativeDriver: true,
    }).start();
    Animated.parallel([
      Animated.spring(contentOpacity, { toValue: 1, ...SPRING }),
      Animated.spring(contentScale, { toValue: 1, ...SPRING }),
    ]).start();
  }, []);

  // One tick a second drives the story, the progress ring and the cards.
  const startStatusTicker = () => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const stopStatusTicker = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (hasStarted) return;
    setHasStarted(true);

    // Reconstruct request from string params
    const travelStyles = parseTravelStyles(params.travelStyles, params.travelStyle);
    const request: GenerateTripRequest = {
      destination: params.destination ?? '',
      countryCode: params.countryCode ?? '',
      placeId: params.placeId || null,
      lat: params.lat && Number.isFinite(Number(params.lat)) ? Number(params.lat) : null,
      lng: params.lng && Number.isFinite(Number(params.lng)) ? Number(params.lng) : null,
      additionalDestinations: (() => {
        try {
          return JSON.parse(params.additionalDestinations ?? '[]') as GenerateTripRequest['additionalDestinations'];
        } catch {
          return [];
        }
      })(),
      durationDays: parseInt(params.durationDays ?? '7', 10),
      travelStyle: travelStyles[0],
      travelStyles,
      visibility: parseTripVisibility(params.visibility),
      pace: (params.pace ?? 'moderate') as GenerateTripRequest['pace'],
      mustSee: (() => {
        try {
          return JSON.parse(params.mustSee ?? '[]') as string[];
        } catch {
          return [];
        }
      })(),
      preferences: params.preferences ?? '',
      startDate: params.startDate ? params.startDate : null,
      endDate: params.endDate ? params.endDate : null,
    };

    startStatusTicker();

    generateTrip(request)
      .then(({ tripId }) => {
        stopStatusTicker();
        // A finish worth the wait: the ring fills, the star bursts, then the trip.
        setFinishing(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => router.replace(`/trip/${tripId}`), 900);
      })
      .catch(() => {
        // Errors are handled by the mutation's onError (resource-exhausted → hosted paywall)
        // Other errors are surfaced via the `error` value from the hook
        stopStatusTicker();
      });

    return () => {
      stopStatusTicker();
    };
    // Intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Error state ────────────────────────────────────────────────────────────

  const isResourceExhausted =
    error instanceof FirebaseError &&
    error.code === 'functions/resource-exhausted';

  // resource-exhausted is handled in the hook (hosted paywall, then back to the form)
  // Only render generic error UI for other error types
  if (error && !isResourceExhausted) {
    const message =
      error instanceof Error
        ? error.message
        : 'Something went wrong. Try again in a moment.';

    return (
      <View style={styles.screen}>
        <LinearGradient colors={DarkColors.gradient.dark} style={StyleSheet.absoluteFill} />

        <View style={styles.errorContainer}>
          <WarningCircle size={44} color={DarkColors.semantic.error} weight="duotone" style={{ marginBottom: Spacing['5'] }} />
          <Text style={styles.errorTitle}>Generation failed</Text>
          <Text style={styles.errorMessage}>{message}</Text>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.retryBtn}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={DarkColors.gradient.purplePink}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.retryGradient}
            >
              <Text style={styles.retryText}>Try again</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace('/(tabs)');
            }}
            style={styles.homeBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.homeBtnText}>Go home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Loading / generating state ─────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <LinearGradient colors={DarkColors.gradient.dark} style={StyleSheet.absoluteFill} />

      {/* Where they're going, slowly drifting under a dark veil — catalog cover only (no Places cost). */}
      {catalog?.coverImageUrl ? (
        <>
          <KenBurnsImage source={{ uri: catalog.coverImageUrl }} active style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFill, styles.coverVeil]} pointerEvents="none" />
        </>
      ) : null}

      {/* Aurora accent */}
      <LinearGradient
        colors={['rgba(167,139,250,0.2)', 'rgba(244,114,182,0.12)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.aurora}
      />

      <Animated.View
        style={[
          styles.content,
          { opacity: contentOpacity, transform: [{ scale: contentScale }] },
        ]}
      >
        <Text style={styles.headline}>Creating your trip</Text>
        <Text style={styles.destination}>
          {destinationDisplay}
        </Text>

        <AiGeneratingAnimation status={status} progress={finishing ? 1 : progressAt(elapsed)} finishing={finishing} />

        {/* While you wait: what travelers love here, then how to get the most from the trip. */}
        <Animated.View
          style={[
            styles.waitCard,
            {
              opacity: cardAnim,
              transform: reduceMotion ? [] : [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <Text style={styles.waitCardTitle}>{card.title}</Text>
          <Text style={styles.waitCardBody}>{card.body}</Text>
        </Animated.View>

        <Text style={styles.footnote}>
          This can take a minute or two. Hang tight.
        </Text>
      </Animated.View>

      {/* Fades out on mount, revealing the dark content — the deliberate
          light→dark handoff from the (light) intake form. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: LightColors.background.primary, opacity: overlayOpacity },
        ]}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  coverVeil: { backgroundColor: 'rgba(11,10,18,0.72)' },
  waitCard: {
    alignSelf: 'stretch',
    marginHorizontal: Spacing['5'],
    marginBottom: Spacing['5'],
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['5'],
    borderRadius: BorderRadius.xl,
    backgroundColor: 'rgba(23,20,34,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DarkColors.background.cardBorder,
    gap: 4,
  },
  waitCardTitle: { color: DarkColors.text.primary, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  waitCardBody: { color: DarkColors.text.secondary, fontSize: FontSize.sm, lineHeight: 20 },
  screen: {
    flex: 1,
    backgroundColor: DarkColors.background.primary,
  },
  aurora: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },

  // Loading layout
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  headline: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semiBold,
    color: DarkColors.text.secondary,
    marginBottom: Spacing['1'],
  },
  destination: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
    color: DarkColors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing['6'],
  },
  footnote: {
    fontSize: FontSize.sm,
    color: DarkColors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['4'],
  },

  // Error layout
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
  },
  errorTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
    color: DarkColors.text.primary,
    marginBottom: Spacing['3'],
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: FontSize.base,
    color: DarkColors.text.secondary,
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
    marginBottom: Spacing['8'],
  },
  retryBtn: {
    width: '100%',
    marginBottom: Spacing['3'],
  },
  retryGradient: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4'],
  },
  retryText: {
    color: DarkColors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  homeBtn: {
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['6'],
  },
  homeBtnText: {
    color: DarkColors.text.tertiary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
});
