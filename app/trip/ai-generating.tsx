import React, { useEffect, useRef, useState } from 'react';
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

// ─── Status messages ──────────────────────────────────────────────────────────

const STATUS_MESSAGES = [
  'Researching destinations...',
  'Planning your itinerary...',
  'Adding local recommendations...',
  'Finalising your trip...',
];

// Status index thresholds in seconds
const STATUS_THRESHOLDS = [0, 3, 6, 9];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AiGeneratingScreen() {
  const params = useLocalSearchParams<{
    destination: string;
    countryCode: string;
    additionalDestinations: string;
    durationDays: string;
    travelStyle: string;
    pace: string;
    mustSee: string;
    preferences: string;
    startDate: string;
    endDate: string;
  }>();

  const { generateTrip, isPending, error } = useAiGenerateTrip();

  const [statusIndex, setStatusIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Advance status messages on a ticker while generating
  const startStatusTicker = () => {
    elapsedRef.current = 0;
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      const elapsed = elapsedRef.current;
      // Find the highest threshold we've passed
      let idx = 0;
      for (let i = STATUS_THRESHOLDS.length - 1; i >= 0; i--) {
        if (elapsed >= STATUS_THRESHOLDS[i]) {
          idx = i;
          break;
        }
      }
      setStatusIndex(idx);
    }, 1000);
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
    const request: GenerateTripRequest = {
      destination: params.destination ?? '',
      countryCode: params.countryCode ?? '',
      additionalDestinations: (() => {
        try {
          return JSON.parse(params.additionalDestinations ?? '[]') as GenerateTripRequest['additionalDestinations'];
        } catch {
          return [];
        }
      })(),
      durationDays: parseInt(params.durationDays ?? '7', 10),
      travelStyle: (params.travelStyle ?? 'adventure') as GenerateTripRequest['travelStyle'],
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
        router.replace(`/trip/${tripId}`);
      })
      .catch(() => {
        // Errors are handled by the mutation's onError (resource-exhausted → paywall)
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

  // resource-exhausted is handled in the hook (redirects to /paywall)
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
          {params.destination || 'your destination'}
        </Text>

        <AiGeneratingAnimation status={STATUS_MESSAGES[statusIndex]} />

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
