import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AiPromptForm } from '@/components/trip/AiPromptForm';
import { TravelStyle } from '@/types/ai';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AiGenerateScreen() {
  const [destination, setDestination] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [travelStyle, setTravelStyle] = useState<TravelStyle>('adventure');
  const [mustSeeInput, setMustSeeInput] = useState('');
  const [preferences, setPreferences] = useState('');

  const isValid = destination.trim().length > 0 && durationDays >= 1;

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
        durationDays: String(durationDays),
        travelStyle,
        mustSee: JSON.stringify(mustSee),
        preferences,
        startDate: '',
        endDate: '',
      },
    });
  };

  return (
    <View style={styles.screen}>
      {/* Background gradient */}
      <LinearGradient
        colors={DarkColors.gradient.dark}
        style={StyleSheet.absoluteFill}
      />

      {/* Aurora accent */}
      <LinearGradient
        colors={['rgba(167,139,250,0.18)', 'rgba(244,114,182,0.1)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.aurora}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>AI Trip Generator</Text>
          <Text style={styles.headerSubtitle}>✨ Powered by Gemini</Text>
        </View>

        {/* Spacer to balance the ✕ button */}
        <View style={styles.headerRight} />
      </View>

      {/* Scrollable form */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Tell us about your dream trip</Text>
          <Text style={styles.sectionSubtitle}>
            Our AI will build a personalised itinerary for you in seconds.
          </Text>

          <AiPromptForm
            destination={destination}
            countryCode={countryCode}
            durationDays={durationDays}
            travelStyle={travelStyle}
            mustSeeInput={mustSeeInput}
            preferences={preferences}
            onDestinationChange={setDestination}
            onCountryCodeChange={setCountryCode}
            onDurationChange={setDurationDays}
            onTravelStyleChange={setTravelStyle}
            onMustSeeChange={setMustSeeInput}
            onPreferencesChange={setPreferences}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={!isValid}
          activeOpacity={0.8}
          style={styles.generateBtnWrapper}
        >
          <LinearGradient
            colors={DarkColors.gradient.purplePink}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.generateBtn, !isValid && styles.generateBtnDisabled]}
          >
            <Text style={styles.generateBtnText}>Generate Trip ✨</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: DarkColors.background.primary,
  },
  flex: { flex: 1 },
  aurora: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },

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
    minWidth: 40,
    alignItems: 'flex-start',
  },
  backText: {
    color: DarkColors.text.secondary,
    fontSize: FontSize.lg,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.primary,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: DarkColors.brand.purple,
    marginTop: 2,
  },
  headerRight: { minWidth: 40 },

  // Scroll content
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['10'],
    paddingTop: Spacing['4'],
  },
  sectionTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    color: DarkColors.text.primary,
    marginBottom: Spacing['2'],
  },
  sectionSubtitle: {
    fontSize: FontSize.base,
    color: DarkColors.text.secondary,
    lineHeight: FontSize.base * 1.5,
    marginBottom: Spacing['8'],
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing['6'],
    paddingTop: Spacing['4'],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  generateBtnWrapper: { width: '100%' },
  generateBtn: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4'],
  },
  generateBtnDisabled: { opacity: 0.4 },
  generateBtnText: {
    color: DarkColors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
});
