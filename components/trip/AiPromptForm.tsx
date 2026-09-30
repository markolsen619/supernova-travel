import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MapPin, MagnifyingGlass, X, Mountains, Diamond, Wallet, UsersThree, Bank } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { TravelStyle, TripPace } from '@/types/ai';
import { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import { DestinationListEditor } from '@/components/trip/DestinationListEditor';
import { Destination, TripVisibility } from '@/types';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { VISIBILITY_ICONS, type PhosphorIcon } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { useProGate } from '@/hooks/useProGate';
import { Badge } from '@/components/ui/Badge';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiPromptFormProps {
  destination: string;
  countryCode: string;
  additionalDestinations: Destination[];
  onAdditionalDestinationsChange: (next: Destination[]) => void;
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (d: Date | null) => void;
  onEndDateChange: (d: Date | null) => void;
  travelStyles: TravelStyle[];
  pace: TripPace;
  visibility: TripVisibility;
  mustSeeInput: string;
  preferences: string;
  onDestinationChange: (v: string) => void;
  onCountryCodeChange: (v: string) => void;
  onTravelStylesChange: (v: TravelStyle[]) => void;
  onPaceChange: (v: TripPace) => void;
  onVisibilityChange: (v: TripVisibility) => void;
  onMustSeeChange: (v: string) => void;
  onPreferencesChange: (v: string) => void;
  destinationPlaceId?: string | null;
  onPlaceSelect?: (s: PlaceSelection) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRAVEL_STYLES: { value: TravelStyle; label: string; Icon: PhosphorIcon }[] = [
  { value: 'adventure', label: 'Adventure', Icon: Mountains },
  { value: 'luxury', label: 'Luxury', Icon: Diamond },
  { value: 'budget', label: 'Budget', Icon: Wallet },
  { value: 'family', label: 'Family', Icon: UsersThree },
  { value: 'cultural', label: 'Cultural', Icon: Bank },
];

/** The generator's cap — generateTrip plans at most two weeks at a time. */
export const MAX_AI_TRIP_DAYS = 14;

// Followers first: it's the default, and the reason the choice exists —
// AI trips used to be private with no way to say otherwise, so friends never
// saw them on a profile.
const VISIBILITY_OPTIONS: { value: TripVisibility; label: string; hint: string }[] = [
  { value: 'followers', label: 'Followers', hint: 'People who follow you can see it' },
  { value: 'public', label: 'Public', hint: 'Anyone can find it in Explore and Search' },
  { value: 'private', label: 'Private', hint: 'Only you' },
];

const PACE_OPTIONS: { value: TripPace; label: string; hint: string }[] = [
  { value: 'relaxed', label: 'Relaxed', hint: 'Fewer stops, more downtime' },
  { value: 'moderate', label: 'Moderate', hint: 'A balanced day' },
  { value: 'packed', label: 'Packed', hint: 'See as much as possible' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AiPromptForm({
  destination,
  countryCode,
  additionalDestinations,
  onAdditionalDestinationsChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  travelStyles,
  pace,
  visibility,
  mustSeeInput,
  preferences,
  onDestinationChange,
  onCountryCodeChange,
  onTravelStylesChange,
  onPaceChange,
  onVisibilityChange,
  onMustSeeChange,
  onPreferencesChange,
  destinationPlaceId,
  onPlaceSelect,
}: AiPromptFormProps) {
  const { colors } = useTheme();
  const { isPro, openPaywall } = useProGate();
  const [pickerVisible, setPickerVisible] = useState(false);
  // Today, fixed for the life of the form — a trip generated now can't start yesterday.
  const [today] = useState(() => new Date());

  const handleOpenPicker = useCallback(() => setPickerVisible(true), []);
  const handleClosePicker = useCallback(() => setPickerVisible(false), []);

  const handlePlaceSelect = useCallback(
    (s: PlaceSelection) => {
      onDestinationChange(s.name);
      if (s.countryCode) onCountryCodeChange(s.countryCode);
      onPlaceSelect?.(s);
      setPickerVisible(false);
    },
    [onDestinationChange, onCountryCodeChange, onPlaceSelect],
  );

  const handleClearPlace = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPlaceSelect?.({
      placeId: '',
      name: '',
      lat: null,
      lng: null,
      countryCode: null,
      primaryType: null,
      viewport: null,
    });
    onDestinationChange('');
    onCountryCodeChange('');
  }, [onPlaceSelect, onDestinationChange, onCountryCodeChange]);

  // Any combination, but never none — the generator needs something to lean on.
  const handleTravelStyleToggle = useCallback((v: TravelStyle) => {
    const selected = travelStyles.includes(v);
    if (selected && travelStyles.length === 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTravelStylesChange(selected ? travelStyles.filter((s) => s !== v) : [...travelStyles, v]);
  }, [travelStyles, onTravelStylesChange]);

  const handleVisibilitySelect = useCallback((v: TripVisibility) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onVisibilityChange(v);
  }, [onVisibilityChange]);

  const handlePaceSelect = useCallback((v: TripPace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPaceChange(v);
  }, [onPaceChange]);

  const handleDatesChange = useCallback(
    (start: Date | null, end: Date | null) => {
      onStartDateChange(start);
      onEndDateChange(end);
    },
    [onStartDateChange, onEndDateChange],
  );

  const isPlaceSelected = Boolean(destinationPlaceId);

  return (
    <View style={styles.container}>
      {/* Destination */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Destination *</Text>

        {isPlaceSelected ? (
          <View style={[styles.selectedRow, { backgroundColor: `${colors.brand.purple}14`, borderColor: colors.brand.purple }]}>
            <MapPin size={16} color={colors.brand.purple} weight="duotone" />
            <Text style={[styles.selectedText, { color: colors.text.primary }]} numberOfLines={1}>{destination}</Text>
            <TouchableOpacity onPress={handleClearPlace} activeOpacity={0.7} hitSlop={10} accessibilityLabel="Clear destination">
              <X size={16} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.pickerBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
            onPress={handleOpenPicker}
            activeOpacity={0.7}
          >
            <MagnifyingGlass size={16} color={colors.text.tertiary} weight="regular" />
            <Text
              style={[styles.pickerBtnText, { color: destination ? colors.text.primary : colors.text.tertiary }]}
              numberOfLines={1}
            >
              {destination || 'Search for a destination…'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Country Code — shown as editable; auto-filled from Places when selected */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Country code (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={countryCode}
          onChangeText={(v) => onCountryCodeChange(v.toUpperCase())}
          placeholder="e.g. JP"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={2}
          returnKeyType="next"
        />
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          {isPlaceSelected ? 'Auto-filled from Places — tap to override' : '2-letter ISO country code'}
        </Text>
      </View>

      {isPlaceSelected && (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Additional destinations (optional)</Text>
          {isPro ? (
            <DestinationListEditor
              destinations={additionalDestinations}
              onChange={onAdditionalDestinationsChange}
            />
          ) : (
            // Multi-city trips are Pro (enforced by generateTrip too).
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
              onPress={openPaywall}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add another city. Pro feature"
            >
              <MapPin size={16} color={colors.text.tertiary} weight="regular" />
              <Text style={[styles.pickerBtnText, { color: colors.text.secondary }]}>Add another city</Text>
              <Badge variant="pro" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Trip dates — the only way to set the length, so they're required. */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Trip dates *</Text>
        <DateRangeField
          start={startDate}
          end={endDate}
          onChange={handleDatesChange}
          optional={false}
          minDate={today}
          maxDays={MAX_AI_TRIP_DAYS}
          placeholder="When are you going?"
        />
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>Up to {MAX_AI_TRIP_DAYS} days</Text>
      </View>

      {/* Travel Style */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Travel style</Text>
        <View style={styles.styleGrid}>
          {TRAVEL_STYLES.map((option) => {
            const active = travelStyles.includes(option.value);
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.stylePill,
                  { backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.card, borderColor: active ? colors.brand.purple : colors.background.cardBorder },
                ]}
                onPress={() => handleTravelStyleToggle(option.value)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${option.label} travel style`}
              >
                <option.Icon size={16} color={active ? colors.brand.purple : colors.text.secondary} weight={active ? 'duotone' : 'regular'} />
                <Text style={[styles.styleLabel, { color: active ? colors.brand.purple : colors.text.secondary }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>Pick as many as fit</Text>
      </View>

      {/* Pace */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Pace</Text>
        <View style={styles.styleGrid}>
          {PACE_OPTIONS.map((option) => {
            const active = pace === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.stylePill,
                  { backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.card, borderColor: active ? colors.brand.purple : colors.background.cardBorder },
                ]}
                onPress={() => handlePaceSelect(option.value)}
                activeOpacity={0.7}
                accessibilityLabel={`${option.label} pace`}
              >
                <Text style={[styles.styleLabel, { color: active ? colors.brand.purple : colors.text.secondary }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          {PACE_OPTIONS.find((o) => o.value === pace)?.hint}
        </Text>
      </View>

      {/* Visibility */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Who can see it</Text>
        <View style={styles.styleGrid}>
          {VISIBILITY_OPTIONS.map((option) => {
            const active = visibility === option.value;
            const { Icon, color } = VISIBILITY_ICONS[option.value];
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.stylePill,
                  { backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.card, borderColor: active ? colors.brand.purple : colors.background.cardBorder },
                ]}
                onPress={() => handleVisibilitySelect(option.value)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${option.label} visibility`}
              >
                <Icon size={16} color={active ? color : colors.text.secondary} weight={active ? 'duotone' : 'regular'} />
                <Text style={[styles.styleLabel, { color: active ? colors.brand.purple : colors.text.secondary }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          {VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.hint}
        </Text>
      </View>

      {/* Must-See */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Must-see places (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={mustSeeInput}
          onChangeText={onMustSeeChange}
          placeholder="Eiffel Tower, Louvre Museum"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>Comma-separated list of places you must visit</Text>
      </View>

      {/* Preferences */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Additional preferences (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={preferences}
          onChangeText={onPreferencesChange}
          placeholder="e.g. I love street food, prefer morning activities, no crowded tourist traps..."
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          returnKeyType="done"
        />
      </View>

      {/* Picker modal */}
      <DestinationPicker
        visible={pickerVisible}
        onSelect={handlePlaceSelect}
        onClose={handleClosePicker}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { paddingTop: Spacing['2'] },
  field: { marginBottom: Spacing['5'] },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['2'],
  },
  hint: {
    fontSize: FontSize.xs,
    marginTop: Spacing['1'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    fontSize: FontSize.base,
  },
  textarea: {
    minHeight: 100,
    paddingTop: Spacing['3'],
  },

  // Destination picker button
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    minHeight: 44,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: FontSize.base,
  },

  // Selected destination chip
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
  },
  selectedText: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },



  // Travel style / pace pills
  styleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  stylePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 36,
  },
  styleLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
