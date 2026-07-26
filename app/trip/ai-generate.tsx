import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { X, Sparkle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { AiPromptForm } from '@/components/trip/AiPromptForm';
import { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { TravelStyle, TripPace } from '@/types/ai';
import { Destination } from '@/types';
import { useAiTripQuota } from '@/hooks/useAiTripQuota';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

function quotaLabel(
  quota: { limit: number | null; remaining: number | null; resetsAt: string | null } | undefined,
): string | null {
  if (!quota) return null; // still loading — show nothing rather than a placeholder flash
  if (quota.limit === null) return 'Unlimited AI trips';
  if ((quota.remaining ?? 0) > 0) {
    const n = quota.remaining ?? 0;
    return `${n} free trip${n === 1 ? '' : 's'} left this week`;
  }
  const resetDate = quota.resetsAt
    ? new Date(quota.resetsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'next week';
  return `0 left this week — resets ${resetDate}`;
}

function diffDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AiGenerateScreen() {
  const { colors } = useTheme();
  // Optional params when navigating from the Search tab's Places picker
  const params = useLocalSearchParams<{
    destination?: string;
    countryCode?: string;
    placeId?: string;
  }>();

  const [destination, setDestination] = useState(params.destination ?? '');
  const [countryCode, setCountryCode] = useState(params.countryCode ?? '');
  const [placeId, setPlaceId] = useState<string | null>(params.placeId ?? null);
  const [additionalDestinations, setAdditionalDestinations] = useState<Destination[]>([]);
  const [durationDays, setDurationDays] = useState(7);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [travelStyle, setTravelStyle] = useState<TravelStyle>('adventure');
  const [pace, setPace] = useState<TripPace>('moderate');
  const [mustSeeInput, setMustSeeInput] = useState('');
  const [preferences, setPreferences] = useState('');

  const { data: quota } = useAiTripQuota();

  const handlePlaceSelect = useCallback((s: PlaceSelection) => {
    setPlaceId(s.placeId || null);
  }, []);

  const datesSet = Boolean(startDate && endDate);
  const derivedDays = diffDays(startDate, endDate);
  const effectiveDurationDays = datesSet && derivedDays !== null ? derivedDays + 1 : durationDays;
  const isValid = destination.trim().length > 0 && effectiveDurationDays >= 1;

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleGenerate = () => {
    if (!isValid) return;

    const mustSee = mustSeeInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    router.push({
      pathname: '/trip/ai-generating',
      params: {
        destination: destination.trim(),
        countryCode: countryCode.trim(),
        additionalDestinations: JSON.stringify(additionalDestinations),
        durationDays: String(effectiveDurationDays),
        travelStyle,
        pace,
        mustSee: JSON.stringify(mustSee),
        preferences,
        startDate: startDate ? startDate.toISOString() : '',
        endDate: endDate ? endDate.toISOString() : '',
      },
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <X size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>AI trip generator</Text>
          <View style={styles.headerSubtitleRow}>
            <Sparkle size={12} color={colors.brand.purple} weight="duotone" />
            <Text style={[styles.headerSubtitle, { color: colors.brand.purple }]}>Powered by Gemini</Text>
          </View>
        </View>

        {/* Spacer to balance the close button */}
        <View style={styles.headerRight} />
      </View>

      {/* Scrollable form */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <NestableScrollContainer
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Tell us about your dream trip</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.text.secondary }]}>
            Our AI will build a personalized itinerary for you in seconds.
          </Text>

          {quotaLabel(quota) ? (
            <View style={[styles.quotaBadge, { backgroundColor: `${colors.brand.purple}1F` }]}>
              <Text style={[styles.quotaBadgeText, { color: colors.brand.purple }]}>{quotaLabel(quota)}</Text>
            </View>
          ) : null}

          <AiPromptForm
            destination={destination}
            countryCode={countryCode}
            additionalDestinations={additionalDestinations}
            onAdditionalDestinationsChange={setAdditionalDestinations}
            durationDays={durationDays}
            travelStyle={travelStyle}
            pace={pace}
            mustSeeInput={mustSeeInput}
            preferences={preferences}
            startDate={startDate}
            endDate={endDate}
            onDestinationChange={setDestination}
            onCountryCodeChange={setCountryCode}
            onDurationChange={setDurationDays}
            onTravelStyleChange={setTravelStyle}
            onPaceChange={setPace}
            onMustSeeChange={setMustSeeInput}
            onPreferencesChange={setPreferences}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            destinationPlaceId={placeId}
            onPlaceSelect={handlePlaceSelect}
          />
        </NestableScrollContainer>
      </KeyboardAvoidingView>

      {/* Footer CTA — the hero gradient moment of this flow. */}
      <View style={[styles.footer, { borderTopColor: colors.background.cardBorder }]}>
        <Button
          label="Generate trip"
          onPress={handleGenerate}
          disabled={!isValid}
          icon={Sparkle}
          variant="hero"
          size="lg"
          fullWidth
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['6'],
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: Spacing['4'],
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
  },
  headerRight: { minWidth: 44 },

  // Scroll content
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['10'],
    paddingTop: Spacing['4'],
  },
  sectionTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
    marginBottom: Spacing['2'],
  },
  sectionSubtitle: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
    marginBottom: Spacing['5'],
  },
  quotaBadge: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    marginBottom: Spacing['6'],
  },
  quotaBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing['6'],
    paddingTop: Spacing['4'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
